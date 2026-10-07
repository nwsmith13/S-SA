import { buildPersistenceManifest, type PersistenceDocument } from './persistence-model.js'
import { requireSupabase } from './supabase'
export const LIBRARY_BUCKET = 'scan-library'
export type LibraryDocument = { id: string; name: string; pdf_filename: string; page_count: number; created_at: string; updated_at: string; pdf_storage_path: string; scan_document_pages: Array<{ id: string; page_index: number; processed_storage_path: string }> }
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
  const { data, error } = await requireSupabase().from('scan_documents').select('id,name,pdf_filename,page_count,created_at,updated_at,pdf_storage_path,scan_document_pages(id,page_index,processed_storage_path)').order('updated_at', { ascending: false }).order('page_index', { referencedTable: 'scan_document_pages', ascending: true })
  if (error) throw error; return (data ?? []) as LibraryDocument[]
}
export async function getLibraryDocument(documentId: string): Promise<LibraryDocument> {
  const { data, error } = await requireSupabase().from('scan_documents').select('id,name,pdf_filename,page_count,created_at,updated_at,pdf_storage_path,scan_document_pages(id,page_index,processed_storage_path)').eq('id', documentId).order('page_index', { referencedTable: 'scan_document_pages', ascending: true }).single()
  if (error) throw error; return data as LibraryDocument
}
export async function createPrivateUrl(path: string, expiresIn = 3600) { const { data, error } = await requireSupabase().storage.from(LIBRARY_BUCKET).createSignedUrl(path, expiresIn); if (error) throw error; return data.signedUrl }
export async function downloadLibraryPdf(path: string, filename: string) { const { data, error } = await requireSupabase().storage.from(LIBRARY_BUCKET).download(path); if (error) throw error; const url = URL.createObjectURL(data); const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 0) }
