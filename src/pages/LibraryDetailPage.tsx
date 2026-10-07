import { ArrowLeft, Download, MoreHorizontal, Printer, Trash2 } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../services/AuthContext'
import { createPrivateUrl, deleteLibraryDocument, downloadLibraryPdf, getLibraryDocument, listLibraryFolders, moveLibraryDocuments, openLibraryPdfForPrint, renameLibraryDocument, type LibraryDocument, type LibraryFolder } from '../services/cloudLibrary'
export function LibraryDetailPage() {
  const { documentId } = useParams()
  const navigate = useNavigate()
  const { user, loading } = useAuth()
  const [document, setDocument] = useState<LibraryDocument | null>(null)
  const [previews, setPreviews] = useState<string[]>([])
  const [folders, setFolders] = useState<LibraryFolder[]>([])
  const [name, setName] = useState('')
  const [editingName, setEditingName] = useState(false)
  const [working, setWorking] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!user || !documentId) return
    let cancelled = false
    void Promise.all([getLibraryDocument(documentId), listLibraryFolders()]).then(async ([result, folderItems]) => {
      const urls = await Promise.all(result.scan_document_pages.map((page) => createPrivateUrl(page.processed_storage_path)))
      if (!cancelled) { setDocument(result); setName(result.name); setPreviews(urls); setFolders(folderItems) }
    }).catch((reason) => { if (!cancelled) setError(reason instanceof Error ? reason.message : 'Unable to load this document.') })
    return () => { cancelled = true }
  }, [user, documentId])

  const saveName = async (event: FormEvent) => {
    event.preventDefault(); if (!document) return
    setWorking(true); setError(''); setNotice('')
    try {
      const renamed = await renameLibraryDocument(document.id, name)
      setDocument(renamed); setName(renamed.name); setEditingName(false); setNotice(`Renamed to ${renamed.name}.`)
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to rename this document.') }
    finally { setWorking(false) }
  }

  const removeDocument = async () => {
    if (!document || !window.confirm(`Delete “${document.name}” and all of its saved pages? This cannot be undone.`)) return
    setWorking(true); setError('')
    try { await deleteLibraryDocument(document); navigate('/library', { replace: true }) }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to delete this document.'); setWorking(false) }
  }

  const download = async () => {
    if (!document) return
    setWorking(true); setError('')
    try { await downloadLibraryPdf(document.pdf_storage_path, document.pdf_filename) }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to download this PDF.') }
    finally { setWorking(false) }
  }

  const print = async () => {
    if (!document) return
    setError('')
    try { await openLibraryPdfForPrint(document.pdf_storage_path) }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to open this PDF for printing.') }
  }

  const move = async (folderId: string) => {
    if (!document) return
    setWorking(true); setError(''); setNotice('')
    try {
      await moveLibraryDocuments([document.id], folderId || null)
      const folder = folders.find((item) => item.id === folderId) ?? null
      setDocument({ ...document, folder_id: folder?.id ?? null, library_folders: folder ? { id: folder.id, name: folder.name } : null })
      setNotice(folder ? `Moved to ${folder.name}.` : 'Moved to Unfiled.')
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to move this document.') }
    finally { setWorking(false) }
  }

  if (!loading && !user) return <Navigate to="/account" replace />
  return <div className="workspace-page library-detail">
    <Link className="library-back" to="/library"><ArrowLeft size={18} /> Library</Link>
    {error && <p className="library-error library-error--compact" role="alert">{error}</p>}
    {!document ? !error && <p className="library-loading">Loading document…</p> : <>
      <header>
        <div className="library-detail-heading">
          <p className="kicker">Completed scan</p>
          {editingName ? <form className="library-rename" onSubmit={saveName}><label htmlFor="library-document-name">Document name</label><div><input id="library-document-name" autoFocus value={name} maxLength={124} onChange={(event) => setName(event.target.value)} /><span>.pdf</span></div><div className="library-rename-actions"><button className="primary-button" disabled={working}>Save name</button><button type="button" disabled={working} onClick={() => { setName(document.name); setEditingName(false) }}>Cancel</button></div></form> : <h1>{document.name}</h1>}
          <dl className="library-metadata"><div><dt>Pages</dt><dd>{document.page_count}</dd></div><div><dt>Created</dt><dd>{new Date(document.created_at).toLocaleDateString()}</dd></div><div><dt>Saved</dt><dd>{new Date(document.updated_at).toLocaleDateString()}</dd></div></dl>
          {notice && <p className="library-notice" role="status">{notice}</p>}
        </div>
        <div className="library-detail-actions"><button className="primary-button library-download" disabled={working} onClick={() => void download()}><Download size={19} /> Download PDF</button><button className="library-print" disabled={working} onClick={() => void print()}><Printer size={19} /> Print</button><details className="library-manage"><summary><MoreHorizontal size={20} /> Manage</summary><div><button type="button" onClick={() => { setNotice(''); setEditingName(true) }}>Rename</button><label htmlFor="detail-folder">Move to folder</label><select id="detail-folder" value={document.folder_id ?? ''} disabled={working} onChange={(event) => void move(event.target.value)}><option value="">Unfiled</option>{folders.map((folder) => <option value={folder.id} key={folder.id}>{folder.name}</option>)}</select><button className="manage-delete" type="button" disabled={working} onClick={() => void removeDocument()}><Trash2 size={17} /> Delete</button></div></details></div>
      </header>
      <section className="library-preview" aria-label="Processed document pages">{previews.map((url, index) => <figure key={document.scan_document_pages[index]?.id ?? url}><img src={url} alt={`Processed page ${index + 1} of ${document.name}`} /><figcaption>Page {index + 1} of {document.page_count}</figcaption></figure>)}</section>
    </>}
  </div>
}
