import { ArrowUpRight, Download, FileCheck2, Folder, FolderPlus, Search, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { PageIntro } from '../components/PageIntro'
import { useAuth } from '../services/AuthContext'
import { createLibraryFolder, createPrivateUrl, deleteLibraryDocuments, deleteLibraryFolder, downloadLibraryPdfs, listLibraryDocuments, listLibraryFolders, moveLibraryDocuments, renameLibraryFolder, type LibraryDocument, type LibraryFolder } from '../services/cloudLibrary'
import { filterLibraryDocuments } from '../services/library-filter.js'

export function LibraryPage() {
  const { user, loading } = useAuth()
  const [documents, setDocuments] = useState<LibraryDocument[]>([])
  const [folders, setFolders] = useState<LibraryFolder[]>([])
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({})
  const [view, setView] = useState<'all' | 'unfiled' | string>('all')
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(new Set<string>())
  const [batchFolder, setBatchFolder] = useState('')
  const [error, setError] = useState('')
  const [fetching, setFetching] = useState(true)
  const [working, setWorking] = useState(false)

  useEffect(() => {
    if (!user) return
    let cancelled = false
    void Promise.all([listLibraryDocuments(), listLibraryFolders()]).then(async ([items, folderItems]) => {
      const pairs = await Promise.all(items.map(async (document) => [document.id, document.scan_document_pages[0] ? await createPrivateUrl(document.scan_document_pages[0].processed_storage_path) : ''] as const))
      if (!cancelled) { setDocuments(items); setFolders(folderItems); setThumbnails(Object.fromEntries(pairs)); setFetching(false) }
    }).catch((reason) => { if (!cancelled) { setError(reason instanceof Error ? reason.message : 'Unable to load your Library.'); setFetching(false) } })
    return () => { cancelled = true }
  }, [user])

  const visibleDocuments = filterLibraryDocuments(documents, view, query)
  const selectedDocuments = documents.filter((document) => selected.has(document.id))
  const currentFolder = folders.find((folder) => folder.id === view)
  const run = async (operation: () => Promise<void>) => { setWorking(true); setError(''); try { await operation() } catch (reason) { setError(reason instanceof Error ? reason.message : 'The Library action could not be completed.') } finally { setWorking(false) } }
  const toggleSelected = (id: string) => setSelected((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next })
  const createFolder = () => { const requested = window.prompt('Name this folder'); if (!requested) return; void run(async () => { const folder = await createLibraryFolder(requested); setFolders((items) => [...items, folder].sort((a, b) => a.name.localeCompare(b.name))); setView(folder.id) }) }
  const renameFolder = () => { if (!currentFolder) return; const requested = window.prompt('Rename folder', currentFolder.name); if (!requested) return; void run(async () => { const folder = await renameLibraryFolder(currentFolder.id, requested); setFolders((items) => items.map((item) => item.id === folder.id ? folder : item).sort((a, b) => a.name.localeCompare(b.name))) }) }
  const removeFolder = () => { if (!currentFolder || !window.confirm(`Delete the folder “${currentFolder.name}”? Its documents will move to Unfiled.`)) return; void run(async () => { await deleteLibraryFolder(currentFolder.id); setFolders((items) => items.filter((item) => item.id !== currentFolder.id)); setDocuments((items) => items.map((document) => document.folder_id === currentFolder.id ? { ...document, folder_id: null, library_folders: null } : document)); setView('unfiled') }) }
  const moveSelected = () => void run(async () => { const folderId = batchFolder || null; await moveLibraryDocuments([...selected], folderId); const folder = folders.find((item) => item.id === folderId) ?? null; setDocuments((items) => items.map((document) => selected.has(document.id) ? { ...document, folder_id: folderId, library_folders: folder ? { id: folder.id, name: folder.name } : null } : document)); setSelected(new Set()) })
  const deleteSelected = () => { if (!selectedDocuments.length || !window.confirm(`Delete ${selectedDocuments.length} selected ${selectedDocuments.length === 1 ? 'document' : 'documents'} and all associated saved files? This cannot be undone.`)) return; void run(async () => { await deleteLibraryDocuments(selectedDocuments); setDocuments((items) => items.filter((document) => !selected.has(document.id))); setSelected(new Set()) }) }

  if (!loading && !user) return <Navigate to="/account" replace />
  return <div className="workspace-page library-page">
    <PageIntro kicker="Library" title="Your documents, wherever you need them.">Completed scans are private to your account and ready on every signed-in device.</PageIntro>
    <div className="library-toolbar"><label><Search size={18} /><span className="visually-hidden">Search Library</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search documents and folders" /></label><button type="button" onClick={createFolder}><FolderPlus size={18} /> New folder</button></div>
    <div className="library-manager">
      <aside className="library-folders" aria-label="Library folders"><button className={view === 'all' ? 'active' : ''} onClick={() => setView('all')}>All documents <span>{documents.length}</span></button><button className={view === 'unfiled' ? 'active' : ''} onClick={() => setView('unfiled')}>Unfiled <span>{documents.filter((document) => !document.folder_id).length}</span></button>{folders.map((folder) => <button className={view === folder.id ? 'active' : ''} key={folder.id} onClick={() => setView(folder.id)}><Folder size={16} /> {folder.name}<span>{documents.filter((document) => document.folder_id === folder.id).length}</span></button>)}</aside>
      <section className="library-content">
        <header><div><p className="kicker">{query ? 'Search results' : view === 'all' ? 'All documents' : view === 'unfiled' ? 'Unfiled' : 'Folder'}</p><h2>{query ? `Results for “${query}”` : currentFolder?.name ?? (view === 'unfiled' ? 'Unfiled' : 'All documents')}</h2></div>{currentFolder && <div className="folder-actions"><button onClick={renameFolder}>Rename folder</button><button onClick={removeFolder}>Delete folder</button></div>}</header>
        {error && <p className="library-error library-error--compact" role="alert">{error}</p>}
        {fetching || loading ? <p className="library-loading">Loading your Library…</p> : visibleDocuments.length ? <section className="library-grid" aria-label="Completed documents">{visibleDocuments.map((document) => <article className={`library-card-shell${selected.has(document.id) ? ' selected' : ''}`} key={document.id}><label className="library-select"><input type="checkbox" checked={selected.has(document.id)} onChange={() => toggleSelected(document.id)} /><span className="visually-hidden">Select {document.name}</span></label><Link className="library-card" to={`/library/${document.id}`} aria-label={`Open ${document.name}, ${document.page_count} ${document.page_count === 1 ? 'page' : 'pages'}`}><div className="library-thumbnail">{thumbnails[document.id] ? <img src={thumbnails[document.id]} alt="" /> : <FileCheck2 size={42} />}</div><div><h3>{document.name}</h3><p>{document.page_count} {document.page_count === 1 ? 'page' : 'pages'}{document.library_folders ? ` · ${document.library_folders.name}` : ''}</p><time dateTime={document.updated_at}>{new Date(document.updated_at).toLocaleDateString()}</time><span className="library-open">Open document <ArrowUpRight size={15} /></span></div></Link></article>)}</section> : <section className="library-no-results"><Search size={34} /><h3>{query ? 'No matching documents.' : 'No documents here yet.'}</h3><p>{query ? 'Try a different document or folder name.' : view === 'unfiled' ? 'Documents without a folder will appear here.' : 'Move documents here from All documents.'}</p></section>}
      </section>
    </div>
    {selected.size > 0 && <section className="library-batch" aria-label="Selected document actions"><strong>{selected.size} selected</strong><div className="batch-move"><select aria-label="Destination folder" value={batchFolder} onChange={(event) => setBatchFolder(event.target.value)}><option value="">Unfiled</option>{folders.map((folder) => <option value={folder.id} key={folder.id}>{folder.name}</option>)}</select><button disabled={working} onClick={moveSelected}>Move</button></div><button disabled={working} onClick={() => void run(() => downloadLibraryPdfs(selectedDocuments))}><Download size={17} /> Download</button><button className="batch-delete" disabled={working} onClick={deleteSelected}><Trash2 size={17} /> Delete</button><button disabled={working} onClick={() => setSelected(new Set())}>Clear</button></section>}
  </div>
}
