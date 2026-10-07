import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { buildPersistenceManifest } from '../src/services/persistence-model.js'

const document = {
  id: '11111111-1111-4111-8111-111111111111', name: 'Quarterly report',
  pages: [
    { id: 'page-b', file: { name: 'back.PNG', type: 'image/png', size: 22 }, processed: { width: 1200, height: 1600 }, mode: 'grayscale', rotation: 90, corners: [{ x: 0, y: 0 }], detectedCorners: [{ x: .1, y: .1 }], confidence: .88 },
    { id: 'page-a', file: { name: 'front.jpg', type: 'image/jpeg', size: 11 }, processed: { width: 1000, height: 1400 }, mode: 'auto', rotation: 0, corners: [{ x: 0, y: 0 }], detectedCorners: [{ x: 0, y: 0 }], confidence: .97 },
  ],
}
const userId = '22222222-2222-4222-8222-222222222222'
const manifest = buildPersistenceManifest({ userId, document, pdfFilename: 'Quarterly report.pdf' })
assert.equal(manifest.document.id, document.id, 'Document identity must remain stable')
assert.equal(manifest.document.user_id, userId, 'Document must carry the authenticated owner')
assert.equal(manifest.document.name, 'Quarterly report')
assert.equal(manifest.document.page_count, 2)
assert.equal(manifest.document.pdf_storage_path, `${userId}/${document.id}/Quarterly report.pdf`)
assert.deepEqual(manifest.pages.map((page) => page.page_index), [0, 1], 'Persisted ordering must match the scan order')
assert.deepEqual(manifest.pages.map((page) => page.id), ['page-b', 'page-a'], 'Reordering must not replace stable page IDs')
assert.match(manifest.pages[0].original_storage_path, /original\.png$/, 'Original extension should be preserved')
assert.match(manifest.pages[0].processed_storage_path, /processed\.jpg$/, 'Processed representation must be a separate object')

const migration = await readFile(new URL('../supabase/migrations/202610070001_cloud_library.sql', import.meta.url), 'utf8')
for (const table of ['scan_documents', 'scan_document_pages']) assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`))
assert.match(migration, /user_id = auth\.uid\(\)/, 'Database rows must enforce authenticated ownership')
assert.match(migration, /\(storage\.foldername\(name\)\)\[1\] = auth\.uid\(\)::text/, 'Storage must enforce the owner path server-side')
assert.match(migration, /unique \(document_id, page_index\)/, 'Page ordering must be unique within a document')

const scan = await readFile(new URL('../src/pages/ScanPage.tsx', import.meta.url), 'utf8')
assert.match(scan, /createDocumentPdf\(processedPages\)[\s\S]*persistCompletedDocument/, 'Cloud persistence must happen after the existing PDF is generated')
assert.match(scan, /download=\{pdfFilename\(doc\.name\)\}/, 'Existing individual filename behavior must remain intact')
const library = await readFile(new URL('../src/services/cloudLibrary.ts', import.meta.url), 'utf8')
assert.match(library, /order\('page_index'.*referencedTable: 'scan_document_pages'/, 'Library retrieval must request stable page ordering')

console.log(JSON.stringify({ ownershipIsolation: 'passed', metadata: 'passed', stableOrdering: 'passed', filenames: 'passed', libraryRetrieval: 'passed' }, null, 2))
