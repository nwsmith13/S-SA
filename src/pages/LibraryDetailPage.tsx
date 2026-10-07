import { ArrowLeft, Download } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { useAuth } from '../services/AuthContext'
import { createPrivateUrl, downloadLibraryPdf, getLibraryDocument, type LibraryDocument } from '../services/cloudLibrary'
export function LibraryDetailPage() {
  const { documentId } = useParams(); const { user, loading } = useAuth(); const [document, setDocument] = useState<LibraryDocument | null>(null); const [previews, setPreviews] = useState<string[]>([]); const [error, setError] = useState('')
  useEffect(() => { if (!user || !documentId) return; let cancelled = false; void getLibraryDocument(documentId).then(async (result) => { const urls = await Promise.all(result.scan_document_pages.map((page) => createPrivateUrl(page.processed_storage_path))); if (!cancelled) { setDocument(result); setPreviews(urls) } }).catch((reason) => { if (!cancelled) setError(reason instanceof Error ? reason.message : 'Unable to load this document.') }); return () => { cancelled = true } }, [user, documentId])
  if (!loading && !user) return <Navigate to="/account" replace />
  return <div className="workspace-page library-detail"><Link className="library-back" to="/library"><ArrowLeft size={18} /> Library</Link>{error ? <p className="library-error" role="alert">{error}</p> : !document ? <p className="library-loading">Loading document…</p> : <><header><div><p className="kicker">Completed scan</p><h1>{document.name}</h1><p>{document.page_count} {document.page_count === 1 ? 'page' : 'pages'} · {new Date(document.updated_at).toLocaleDateString()}</p></div><button className="primary-button" onClick={() => void downloadLibraryPdf(document.pdf_storage_path, document.pdf_filename)}><Download size={19} /> Download PDF</button></header><section className="library-preview" aria-label="Document pages">{previews.map((url, index) => <figure key={url}><img src={url} alt={`Page ${index + 1} of ${document.name}`} /><figcaption>Page {index + 1}</figcaption></figure>)}</section></>}</div>
}
