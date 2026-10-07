import { FileCheck2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { PageIntro } from '../components/PageIntro'
import { useAuth } from '../services/AuthContext'
import { createPrivateUrl, listLibraryDocuments, type LibraryDocument } from '../services/cloudLibrary'

export function LibraryPage() {
  const { user, loading } = useAuth(); const [documents, setDocuments] = useState<LibraryDocument[]>([]); const [thumbnails, setThumbnails] = useState<Record<string, string>>({}); const [error, setError] = useState(''); const [fetching, setFetching] = useState(true)
  useEffect(() => { if (!user) return; let cancelled = false; void listLibraryDocuments().then(async (items) => { const pairs = await Promise.all(items.map(async (document) => [document.id, document.scan_document_pages[0] ? await createPrivateUrl(document.scan_document_pages[0].processed_storage_path) : ''] as const)); if (!cancelled) { setDocuments(items); setThumbnails(Object.fromEntries(pairs)); setFetching(false) } }).catch((reason) => { if (!cancelled) { setError(reason instanceof Error ? reason.message : 'Unable to load your Library.'); setFetching(false) } }); return () => { cancelled = true } }, [user])
  if (!loading && !user) return <Navigate to="/account" replace />
  return <div className="workspace-page library-page"><PageIntro kicker="Library" title="Your documents, wherever you need them.">Completed scans are private to your account and ready on every signed-in device.</PageIntro>{error ? <p className="library-error" role="alert">{error}</p> : fetching || loading ? <p className="library-loading">Loading your Library…</p> : documents.length ? <section className="library-grid" aria-label="Completed documents">{documents.map((document) => <Link className="library-card" to={`/library/${document.id}`} key={document.id}><div className="library-thumbnail">{thumbnails[document.id] ? <img src={thumbnails[document.id]} alt="" /> : <FileCheck2 size={42} />}</div><div><h2>{document.name}</h2><p>{document.page_count} {document.page_count === 1 ? 'page' : 'pages'}</p><time dateTime={document.updated_at}>{new Date(document.updated_at).toLocaleDateString()}</time></div></Link>)}</section> : <section className="library-empty"><div className="empty-mark" aria-hidden="true"><FileCheck2 size={48} strokeWidth={1.35} /></div><h2>Quiet in here—for now.</h2><p>Completed scans will appear here automatically.</p><div className="empty-actions"><Link className="primary-button" to="/scan">Scan paper</Link></div></section>}</div>
}
