import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolveDocumentName } from '../src/document-processing/filenames.js'

assert.equal(resolveDocumentName(' Test1.pdf ', 'Scan', []), 'Test1', 'Rename must reuse PDF stripping and sanitization')
assert.equal(resolveDocumentName('Test1', 'Scan', ['test1']), 'Test1 (2)', 'Rename must reuse case-insensitive duplicate suffixing')
assert.equal(resolveDocumentName('Test1', 'Scan', ['Test1', 'test1 (2)']), 'Test1 (3)', 'Duplicate suffixes must advance stably')

const detail = await readFile(new URL('../src/pages/LibraryDetailPage.tsx', import.meta.url), 'utf8')
assert.match(detail, /getLibraryDocument\(documentId\)/, 'Detail route must retrieve the saved document')
assert.match(detail, /Processed document pages/, 'Detail must expose every processed page')
assert.match(detail, /Page \{index \+ 1\} of \{document\.page_count\}/, 'Page previews must communicate order')
assert.match(detail, /downloadLibraryPdf\(document\.pdf_storage_path, document\.pdf_filename\)/, 'Download must use the stored PDF and current filename')
assert.doesNotMatch(detail, /createDocumentPdf|processDocument/, 'Detail must not regenerate or reprocess the scan')
assert.match(detail, /renameLibraryDocument\(document\.id, name\)/, 'Rename must persist through the Library service')
assert.match(detail, /window\.confirm\(`Delete “\$\{document\.name\}”/, 'Delete confirmation must identify the document')
assert.match(detail, /deleteLibraryDocument\(document\)/, 'Confirmed delete must call persisted deletion')

const service = await readFile(new URL('../src/services/cloudLibrary.ts', import.meta.url), 'utf8')
assert.match(service, /\.update\(\{ name, pdf_filename: pdfFilename\(name\) \}\)\.eq\('id', documentId\)/, 'Rename must update name and download filename under row RLS')
assert.match(service, /storage\.from\(LIBRARY_BUCKET\)\.remove\(objectPaths\)/, 'Delete must remove original, processed, and PDF objects')
assert.match(service, /from\('scan_documents'\)\.delete\(\)\.in\('id', documents\.map/, 'Delete must remove persisted metadata')
assert.match(service, /sort\(\(a, b\) => a\.page_index - b\.page_index\)/, 'Detail retrieval must defensively preserve page order')

const migration = await readFile(new URL('../supabase/migrations/202610070001_cloud_library.sql', import.meta.url), 'utf8')
assert.match(migration, /owners update scan documents[\s\S]*user_id = auth\.uid\(\)/, 'Rename must remain owner-isolated by RLS')
assert.match(migration, /owners delete scan documents[\s\S]*user_id = auth\.uid\(\)/, 'Document deletion must remain owner-isolated by RLS')
assert.match(migration, /owners delete scan files[\s\S]*storage\.foldername\(name\)[\s\S]*auth\.uid\(\)/, 'Storage deletion must remain owner-isolated')

console.log(JSON.stringify({ openDetail: 'passed', orderedPreviews: 'passed', existingPdfDownload: 'passed', persistedRename: 'passed', duplicateSanitization: 'passed', deleteConfirmation: 'passed', persistedDeletion: 'passed', accountIsolation: 'passed' }, null, 2))
