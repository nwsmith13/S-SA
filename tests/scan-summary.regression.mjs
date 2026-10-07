import assert from 'node:assert/strict'
import fs from 'node:fs'
import { pdfFilename, resolveDocumentName, resolveDocumentNames, sanitizeDocumentName } from '../src/document-processing/filenames.js'
import { createZipBlob } from '../src/document-processing/zip.js'

assert.equal(sanitizeDocumentName('  Quarterly report.pdf  ', 'Scan-1'), 'Quarterly report')
assert.equal(sanitizeDocumentName('Client: West / Final?*', 'Scan-1'), 'Client- West - Final--')
assert.equal(sanitizeDocumentName('CON', 'Scan-1'), 'CON-document')
assert.equal(sanitizeDocumentName('   ', 'Scan-7'), 'Scan-7')
assert.equal(sanitizeDocumentName(`${'A'.repeat(140)}.pdf`, 'Scan-1').length, 120)
assert.equal(pdfFilename('Quarterly report'), 'Quarterly report.pdf')
assert.equal(resolveDocumentName(' Report.pdf ', 'Scan', ['Report']), 'Report (2)')
assert.equal(resolveDocumentName('CON', 'Scan', []), 'CON-document')

const named = resolveDocumentNames([
  { id: 'stable-a', name: 'Report', fallbackName: 'Scan-1' },
  { id: 'stable-b', name: 'report.pdf', fallbackName: 'Scan-2' },
  { id: 'stable-c', name: 'Report (2)', fallbackName: 'Scan-3' },
])
assert.deepEqual(named.map(({ id, name }) => [id, name]), [
  ['stable-a', 'Report'],
  ['stable-b', 'report (2)'],
  ['stable-c', 'Report (2) (2)'],
])

const entries = [
  { name: 'Report.pdf', blob: new Blob(['first PDF']) },
  { name: 'report (2).pdf', blob: new Blob(['second PDF']) },
]
const zip = new Uint8Array(await (await createZipBlob(entries)).arrayBuffer())
const decoded = new TextDecoder().decode(zip)
assert.equal((decoded.match(/Report\.pdf/g) ?? []).length, 2, 'First filename should occur once locally and once centrally')
assert.equal((decoded.match(/report \(2\)\.pdf/g) ?? []).length, 2, 'Second filename should occur once locally and once centrally')
assert.equal(new DataView(zip.buffer).getUint32(zip.length - 22, true), 0x06054b50, 'ZIP should end with a valid central directory record')
assert.equal(new DataView(zip.buffer).getUint16(zip.length - 14, true), entries.length, 'ZIP should contain every PDF exactly once')

const scanPage = fs.readFileSync('src/pages/ScanPage.tsx', 'utf8')
assert.match(scanPage, /type ScanDocument = \{ id: string; name: string; fallbackName: string;/, 'Names should belong to stable document identity')
assert.match(scanPage, /onEdit=\{\(\) => setView\('review'\)\}/, 'Return and edit should preserve component state')
assert.match(scanPage, /pdf\.blob/, 'Bulk download should reuse each generated PDF blob')
assert.match(scanPage, /pdfFilename\(doc\.name\)/, 'Individual download names should follow the current document name')

console.log('Scan summary naming and ZIP regression checks passed.')
