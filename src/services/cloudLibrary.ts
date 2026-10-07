import { buildPersistenceManifest, type PersistenceDocument } from './persistence-model.js'
import { requireSupabase } from './supabase'
import { pdfFilename, resolveDocumentName, resolveDocumentNames } from '../document-processing/filenames.js'
import { createZipBlob } from '../document-processing/zip.js'
export const LIBRARY_BUCKET = 'scan-library'
export type LibraryFolder = { id: string; name: string; created_at: string; updated_at: string }
export type LibraryDocument = { id: string; name: string; pdf_filename: string; page_count: number; created_at: string; updated_at: string; pdf_storage_path: string; folder_id: string | null; library_folders: { id: string; name: string } | null; scan_document_pages: Array<{ id: string; page_index: number; original_storage_path: string; processed_storage_path: string }> }
type LibraryDocumentQuery = Omit<LibraryDocument, 'library_folders'> & { library_folders: LibraryDocument['library_folders'] | Array<NonNullable<LibraryDocument['library_folders']>> }
const librarySelect = 'id,name,pdf_filename,page_count,created_at,updated_at,pdf_storage_path,folder_id,library_folders(id,name),scan_document_pages(id,page_index,original_storage_path,processed_storage_path)'
const orderPages = (document: LibraryDocumentQuery): LibraryDocument => ({ ...document, library_folders: Array.isArray(document.library_folders) ? document.library_folders[0] ?? null : document.library_folders, scan_document_pages: [...document.scan_document_pages].sort((a, b) => a.page_index - b.page_index) })
export async function persistCompletedDocument(userId: string, document: PersistenceDocument, pdfName: string, pdfBlob: Blob) {
  const client = requireSupabase(); const manifest = buildPersistenceManifest({ userId, document, pdfFilename: pdfName })
  try {
    for (const [index, page] of document.pages.entries()) {
      const row = manifest.pages[index]; const originalPath = String(row.original_storage_path); const processedPath = String(row.processed_storage_path)
      const original = await client.storage.from(LIBRARY_BUCKET).upload(originalPath, page.file, { contentType: page.file.type || undefined, upsert: true }); if (original.error) throw original.error
      const processed = await client.storage.from(LIBRARY_BUCKET).upload(processedPath, page.processed.blob, { contentType: 'image/jpeg', upsert: true }); if (processed.error) throw processed.error
    }
    const pdfPath = String(manifest.document.pdf_storage_path); const pdf = await client.storage.from(LIBRARY_BUCKET).upload(pdfPath, pdfBlob, { contentType: 'application/pdf', upsert: true }); if (pdf.error) throw pdf.error
    const documentResult = await client.from('scan_documents').upsert(manifest.document, { onConflict: 'id' }); if (documentResult.error) throw documentResult.error
    const pagesResult = await client.from('scan_document_pages').upsert(manifest.pages, { onConflict: 'id' }); if (pagesResult.error) throw pagesResult.error
  } catch (error) {
    // Deterministic paths make a retry safe. Do not delete here: an upsert retry may
    // have replaced an already-persisted object that must remain available.
    throw error
  }
}
export async function listLibraryDocuments(): Promise<LibraryDocument[]> {
  const { data, error } = await requireSupabase().from('scan_documents').select(librarySelect).order('updated_at', { ascending: false }).order('page_index', { referencedTable: 'scan_document_pages', ascending: true })
  if (error) throw error; return ((data ?? []) as unknown as LibraryDocumentQuery[]).map(orderPages)
}
export async function getLibraryDocument(documentId: string): Promise<LibraryDocument> {
  const { data, error } = await requireSupabase().from('scan_documents').select(librarySelect).eq('id', documentId).order('page_index', { referencedTable: 'scan_document_pages', ascending: true }).single()
  if (error) throw error; return orderPages(data as unknown as LibraryDocumentQuery)
}
export async function renameLibraryDocument(documentId: string, requestedName: string) {
  const client = requireSupabase()
  const { data: otherDocuments, error: namesError } = await client.from('scan_documents').select('name').neq('id', documentId)
  if (namesError) throw namesError
  const name = resolveDocumentName(requestedName, 'Scan', (otherDocuments ?? []).map((document) => document.name))
  const { data, error } = await client.from('scan_documents').update({ name, pdf_filename: pdfFilename(name) }).eq('id', documentId).select(librarySelect).single()
  if (error) throw error
  return orderPages(data as unknown as LibraryDocumentQuery)
}
export async function deleteLibraryDocument(document: LibraryDocument) {
  await deleteLibraryDocuments([document])
}
export async function deleteLibraryDocuments(documents: LibraryDocument[]) {
  if (!documents.length) return
  const client = requireSupabase()
  const objectPaths = documents.flatMap((document) => [document.pdf_storage_path, ...document.scan_document_pages.flatMap((page) => [page.original_storage_path, page.processed_storage_path])])
  const storageResult = await client.storage.from(LIBRARY_BUCKET).remove(objectPaths)
  if (storageResult.error) throw storageResult.error
  const { error } = await client.from('scan_documents').delete().in('id', documents.map((document) => document.id))
  if (error) throw error
}
export async function createPrivateUrl(path: string, expiresIn = 3600) { const { data, error } = await requireSupabase().storage.from(LIBRARY_BUCKET).createSignedUrl(path, expiresIn); if (error) throw error; return data.signedUrl }
export async function downloadLibraryPdf(path: string, filename: string) { const { data, error } = await requireSupabase().storage.from(LIBRARY_BUCKET).download(path); if (error) throw error; const url = URL.createObjectURL(data); const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 0) }
export async function openLibraryPdfForPrint(path: string) {
  const url = await createPrivateUrl(path, 300)
  const printWindow = window.open(url, '_blank')
  if (!printWindow) throw new Error('Allow pop-ups to open the PDF, then use your browser or device Print action.')
  printWindow.opener = null
}
export async function downloadLibraryPdfs(documents: LibraryDocument[]) {
  if (!documents.length) return
  if (documents.length === 1) return downloadLibraryPdf(documents[0].pdf_storage_path, documents[0].pdf_filename)
  const client = requireSupabase()
  const named = resolveDocumentNames(documents.map((document) => ({ ...document, fallbackName: 'Scan' })))
  const entries = []
  for (const document of named) {
    const { data, error } = await client.storage.from(LIBRARY_BUCKET).download(document.pdf_storage_path)
    if (error) throw error
    entries.push({ name: pdfFilename(document.name), blob: data })
  }
  const zip = await createZipBlob(entries)
  const url = URL.createObjectURL(zip); const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'S-SA-Library.zip'; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 0)
}

export async function listLibraryFolders(): Promise<LibraryFolder[]> {
  const { data, error } = await requireSupabase().from('library_folders').select('id,name,created_at,updated_at').order('name')
  if (error) throw error
  return (data ?? []) as LibraryFolder[]
}
async function availableFolderName(requestedName: string, excludeId?: string) {
  let query = requireSupabase().from('library_folders').select('name')
  if (excludeId) query = query.neq('id', excludeId)
  const { data, error } = await query
  if (error) throw error
  return resolveDocumentName(requestedName, 'Folder', (data ?? []).map((folder) => folder.name))
}
export async function createLibraryFolder(requestedName: string): Promise<LibraryFolder> {
  const client = requireSupabase(); const { data: userData, error: userError } = await client.auth.getUser(); if (userError || !userData.user) throw userError ?? new Error('Sign in to create a folder.')
  const name = await availableFolderName(requestedName)
  const { data, error } = await client.from('library_folders').insert({ user_id: userData.user.id, name }).select('id,name,created_at,updated_at').single()
  if (error) throw error
  return data as LibraryFolder
}
export async function renameLibraryFolder(folderId: string, requestedName: string): Promise<LibraryFolder> {
  const name = await availableFolderName(requestedName, folderId)
  const { data, error } = await requireSupabase().from('library_folders').update({ name }).eq('id', folderId).select('id,name,created_at,updated_at').single()
  if (error) throw error
  return data as LibraryFolder
}
export async function deleteLibraryFolder(folderId: string) {
  const { error } = await requireSupabase().from('library_folders').delete().eq('id', folderId)
  if (error) throw error
}
export async function moveLibraryDocuments(documentIds: string[], folderId: string | null) {
  if (!documentIds.length) return
  const { error } = await requireSupabase().from('scan_documents').update({ folder_id: folderId }).in('id', documentIds)
  if (error) throw error
}
