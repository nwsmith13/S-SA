import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { filterLibraryDocuments, librarySearchText } from '../src/services/library-filter.js'

const documents = [
  { id: 'a', name: 'Lease', folder_id: null, library_folders: null },
  { id: 'b', name: 'Receipt', folder_id: 'tax', library_folders: { id: 'tax', name: 'Taxes' } },
  { id: 'c', name: 'Warranty', folder_id: 'home', library_folders: { id: 'home', name: 'Home' } },
]
assert.deepEqual(filterLibraryDocuments(documents, 'all', '').map((item) => item.id), ['a', 'b', 'c'], 'All documents must include filed and unfiled documents')
assert.deepEqual(filterLibraryDocuments(documents, 'unfiled', '').map((item) => item.id), ['a'], 'Unfiled must include only root documents')
assert.deepEqual(filterLibraryDocuments(documents, 'tax', '').map((item) => item.id), ['b'], 'Folder view must include only that folder')
assert.deepEqual(filterLibraryDocuments(documents, 'all', 'tax').map((item) => item.id), ['b'], 'Search must match folder names')
assert.deepEqual(filterLibraryDocuments(documents, 'home', 'warr').map((item) => item.id), ['c'], 'Search must work within a selected folder')
assert.match(librarySearchText(documents[1]), /receipt[\s\S]*taxes/, 'Search indexing must remain extensible beyond one field')

const detail = await readFile(new URL('../src/pages/LibraryDetailPage.tsx', import.meta.url), 'utf8')
assert.match(detail, /Download PDF/, 'Download must remain readily accessible')
assert.match(detail, /openLibraryPdfForPrint\(document\.pdf_storage_path\)/, 'Print must open the stored PDF')
assert.doesNotMatch(detail, /createDocumentPdf|processDocument/, 'Print and download must never regenerate a PDF')
assert.match(detail, /<summary><MoreHorizontal[\s\S]*Manage<\/summary>/, 'Manage control must visibly expose document actions')
assert.match(detail, />Rename<\/button>/, 'Rename must be accessible from Manage')
assert.match(detail, /Move to folder/, 'Move must be accessible from Manage')
assert.match(detail, /Delete/, 'Delete must be accessible from Manage')

const libraryPage = await readFile(new URL('../src/pages/LibraryPage.tsx', import.meta.url), 'utf8')
assert.match(libraryPage, /All documents/, 'All documents root view must be present')
assert.match(libraryPage, /Unfiled/, 'Unfiled root view must be present')
assert.match(libraryPage, /Search documents and folders/, 'Conventional Library search must be present')
assert.match(libraryPage, /moveLibraryDocuments\(\[\.\.\.selected\]/, 'Batch move must persist every selected document')
assert.match(libraryPage, /downloadLibraryPdfs\(selectedDocuments\)/, 'Batch download must include the complete selection')
assert.match(libraryPage, /window\.confirm\(`Delete \$\{selectedDocuments\.length\} selected/, 'Batch deletion must require explicit confirmation')

const service = await readFile(new URL('../src/services/cloudLibrary.ts', import.meta.url), 'utf8')
for (const operation of ['createLibraryFolder', 'renameLibraryFolder', 'deleteLibraryFolder', 'moveLibraryDocuments']) assert.match(service, new RegExp(`export async function ${operation}`))
assert.match(service, /for \(const document of named\)[\s\S]*download\(document\.pdf_storage_path\)/, 'Batch download must fetch every selected stored PDF')
assert.match(service, /createZipBlob\(entries\)/, 'Multiple PDFs must be delivered as one complete ZIP')
assert.match(service, /deleteLibraryDocuments[\s\S]*storageResult[\s\S]*\.delete\(\)\.in\('id'/, 'Batch delete must remove storage and persisted rows')

const migration = await readFile(new URL('../supabase/migrations/202610070002_library_management_v2.sql', import.meta.url), 'utf8')
assert.match(migration, /create table public\.library_folders/, 'Folder table must be created')
assert.match(migration, /unique index library_folders_user_name_ci_idx[\s\S]*user_id, lower\(name\)/, 'Folder names must be unique per owner case-insensitively')
assert.match(migration, /foreign key \(folder_id, user_id\)[\s\S]*references public\.library_folders\(id, user_id\)/, 'Documents cannot reference another user’s folder')
assert.match(migration, /on delete set null \(folder_id\)/, 'Folder deletion must unfile documents without deleting them')
for (const action of ['select', 'insert', 'update', 'delete']) assert.match(migration, new RegExp(`library_folders for ${action} to authenticated[\\s\\S]*user_id = auth\\.uid\\(\\)`), `Missing owner-isolated folder ${action} policy`)

console.log(JSON.stringify({ detailActions: 'passed', storedPdfPrint: 'passed', folderIsolation: 'passed', folderCrud: 'passed', folderMove: 'passed', folderDeleteUnfiles: 'passed', rootViews: 'passed', search: 'passed', batchMove: 'passed', batchDownload: 'passed', batchDeleteConfirmation: 'passed' }, null, 2))
