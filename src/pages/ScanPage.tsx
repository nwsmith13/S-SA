import { Camera, Check, ChevronLeft, ChevronRight, Download, FilePlus2, GripVertical, Images, Plus, RotateCcw, RotateCw, ScanLine, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { CornerEditor } from '../components/CornerEditor'
import { DiagnosticsPanel } from '../components/DiagnosticsPanel'
import { PageComparison } from '../components/PageComparison'
import { PageIntro } from '../components/PageIntro'
import { createDocumentPdf } from '../document-processing/pdf'
import { emitDiagnostic, serializeDiagnosticError } from '../document-processing/diagnostics'
import { commitPageProcessingResult } from '../document-processing/page-identity'
import { detectDocument, processDocument, type DetectionDiagnosticContext } from '../document-processing/processor'
import { describeGeometry, describeGeometryTransition } from '../document-processing/geometry-diagnostics'
import { fullImageCorners, type Point, type ProcessedPage, type ProcessingMode, type ProcessingStatus } from '../document-processing/types'

type ScanPage = {
  id: string
  file: File
  originalUrl: string
  processedUrl?: string
  processed?: ProcessedPage
  rotation: number
  mode: ProcessingMode
  status: ProcessingStatus
  corners: Point[]
  detectedCorners: Point[]
  confidence: number
  message?: string
  processingToken?: string
}

type ScanDocument = { id: string; pages: ScanPage[] }
type ScanView = 'intake' | 'review' | 'summary'
type PdfResult = { documentId: string; url: string; name: string }

const acceptedImages = 'image/jpeg,image/png,image/heic,image/heif,.jpg,.jpeg,.png,.heic,.heif'
const modeLabels: Record<ProcessingMode, string> = { auto: 'Auto', color: 'Color', grayscale: 'Grayscale', 'black-white': 'Black & white' }
const statusLabels: Record<ProcessingStatus, string> = { preparing: 'Preparing', finding: 'Finding paper', cleaning: 'Cleaning up', ready: 'Ready', attention: 'Check the edges' }
const makeId = () => typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`
const createDocument = (): ScanDocument => ({ id: makeId(), pages: [] })

export function ScanPage() {
  const cameraInput = useRef<HTMLInputElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const documentsRef = useRef<ScanDocument[]>([])
  const pdfsRef = useRef<PdfResult[]>([])
  const livePageIds = useRef(new Set<string>())
  const [documents, setDocuments] = useState<ScanDocument[]>([])
  const [currentId, setCurrentId] = useState<string | null>(null)
  const [view, setView] = useState<ScanView>('intake')
  const [draggedId, setDraggedId] = useState<string | null>(null)
  const [editingPageId, setEditingPageId] = useState<string | null>(null)
  const [reviewingPageId, setReviewingPageId] = useState<string | null>(null)
  const [pdfs, setPdfs] = useState<PdfResult[]>([])
  const [creatingPdfs, setCreatingPdfs] = useState(false)

  useEffect(() => { documentsRef.current = documents }, [documents])
  useEffect(() => { pdfsRef.current = pdfs }, [pdfs])
  useEffect(() => () => {
    documentsRef.current.forEach((doc) => doc.pages.forEach((page) => {
      URL.revokeObjectURL(page.originalUrl)
      if (page.processedUrl) URL.revokeObjectURL(page.processedUrl)
    }))
    pdfsRef.current.forEach((pdf) => URL.revokeObjectURL(pdf.url))
  }, [])

  const currentDocument = documents.find((doc) => doc.id === currentId) ?? null
  const filledDocuments = documents.filter((doc) => doc.pages.length > 0)
  const allPages = filledDocuments.flatMap((doc) => doc.pages)
  const totalPages = allPages.length
  const processing = allPages.some((page) => page.status !== 'ready')
  const editingPage = allPages.find((page) => page.id === editingPageId)
  const editingDocument = filledDocuments.find((document) => document.pages.some((page) => page.id === editingPageId))
  const editingPageIndex = editingDocument?.pages.findIndex((page) => page.id === editingPageId) ?? -1
  const reviewingPage = allPages.find((page) => page.id === reviewingPageId)

  const updatePage = (pageId: string, update: (page: ScanPage) => ScanPage) => {
    setDocuments((existing) => existing.map((doc) => ({ ...doc, pages: doc.pages.map((page) => page.id === pageId ? update(page) : page) })))
  }

  const renderPage = async (pageId: string, file: File, corners: Point[], mode: ProcessingMode, rotation: number, detectedCorners: Point[], confidence: number, diagnosticContext?: 'manual-apply') => {
    const processingToken = makeId()
    emitDiagnostic('[S&SA page identity]', { operation: 'processing-started', pageId, processingToken, file: { name: file.name, type: file.type, bytes: file.size, lastModified: file.lastModified }, mode, rotation })
    updatePage(pageId, (page) => ({ ...page, status: 'cleaning', message: undefined, processingToken }))
    try {
      if (diagnosticContext) emitDiagnostic('[S&SA apply checkpoint]', { operation: 'process-document', phase: 'before', normalizedCorners: corners, mode, rotation })
      const processed = await processDocument(file, corners, mode, rotation)
      if (diagnosticContext) emitDiagnostic('[S&SA apply checkpoint]', { operation: 'process-document', phase: 'after', outputDimensions: `${processed.width}x${processed.height}`, blobBytes: processed.blob.size })
      let processedUrl: string
      try {
        if (diagnosticContext) emitDiagnostic('[S&SA apply checkpoint]', { operation: 'processed-url-creation', phase: 'before', blobBytes: processed.blob.size })
        processedUrl = URL.createObjectURL(processed.blob)
        if (diagnosticContext) emitDiagnostic('[S&SA apply checkpoint]', { operation: 'processed-url-creation', phase: 'after' })
      } catch (error) {
        emitDiagnostic('[S&SA processed URL failure]', { stage: 'processed-url-replacement', file: { type: file.type, bytes: file.size }, blobBytes: processed.blob.size, error: serializeDiagnosticError(error) }, 'error')
        throw error
      }
      if (diagnosticContext) emitDiagnostic('[S&SA apply checkpoint]', { operation: 'live-page-check', phase: 'before', pageIsLive: livePageIds.current.has(pageId) })
      if (!livePageIds.current.has(pageId)) {
        emitDiagnostic('[S&SA page identity]', { operation: 'processing-discarded', reason: 'page-removed', pageId, processingToken })
        URL.revokeObjectURL(processedUrl); return false
      }
      if (diagnosticContext) emitDiagnostic('[S&SA apply checkpoint]', { operation: 'processed-state-replacement', phase: 'before' })
      setDocuments((existing) => commitPageProcessingResult(existing, pageId, processingToken, (page) => {
        if (page.processedUrl) URL.revokeObjectURL(page.processedUrl)
        return { ...page, processed, processedUrl, corners, detectedCorners, confidence, mode, rotation, status: 'ready', message: undefined, processingToken: undefined }
      }, (reason) => {
        URL.revokeObjectURL(processedUrl)
        emitDiagnostic('[S&SA page identity]', { operation: 'processing-discarded', reason, pageId, processingToken }, 'warn')
      }))
      emitDiagnostic('[S&SA page identity]', { operation: 'processing-commit-requested', pageId, processingToken })
      if (diagnosticContext) emitDiagnostic('[S&SA apply checkpoint]', { operation: 'processed-state-replacement', phase: 'after' })
      return true
    } catch (error) {
      emitDiagnostic('[S&SA page processing rejected]', { stage: 'render-page', normalizedCorners: corners, mode, rotation, error: serializeDiagnosticError(error) }, 'error')
      updatePage(pageId, (page) => page.processingToken === processingToken ? { ...page, corners, detectedCorners, confidence: 0, status: 'attention', message: "S&SA couldn't confidently clean this page up.", processingToken: undefined } : page)
      setEditingPageId((current) => current ?? pageId)
      return false
    }
  }

  const preparePage = async (page: ScanPage, initialIdentity: DetectionDiagnosticContext) => {
    const liveDocument = documentsRef.current.find((document) => document.pages.some((item) => item.id === page.id))
    const livePageIndex = liveDocument?.pages.findIndex((item) => item.id === page.id) ?? -1
    const identity = liveDocument && livePageIndex >= 0
      ? { pageId: page.id, documentId: liveDocument.id, pageIndex: livePageIndex, pageNumber: livePageIndex + 1 }
      : initialIdentity
    updatePage(page.id, (current) => ({ ...current, status: 'finding' }))
    try {
      const detection = await detectDocument(page.file, identity)
      if (detection.confidence < .5) {
        const transition = describeGeometryTransition(detection.orderedCorners, detection.corners)
        emitDiagnostic('[S&SA detection UI result]', { ...identity, resultState: 'manual-adjust-edges', editorCorners: detection.corners, cornerSource: 'candidate', selectedCandidateMethod: detection.method, candidateConfidence: detection.confidence, geometry: { orderedCandidate: describeGeometry(detection.orderedCorners), uiHandoff: describeGeometry(detection.corners), transition } })
        if (transition.cornerOrderChanged || transition.becameNonConvex || transition.becameSelfIntersecting) emitDiagnostic('[S&SA GEOMETRY WARNING]', { ...identity, transition: 'ordered-candidate-to-ui-handoff', analysis: transition, from: describeGeometry(detection.orderedCorners), to: describeGeometry(detection.corners) }, 'error')
        updatePage(page.id, (current) => ({ ...current, corners: detection.corners, detectedCorners: detection.corners, confidence: detection.confidence, status: 'attention', message: 'Check the edges before cleaning up this page.' }))
        setEditingPageId((current) => current ?? page.id)
        return
      }
      emitDiagnostic('[S&SA detection UI result]', { ...identity, resultState: 'auto-apply', editorCorners: null, cornerSource: 'not-required', selectedCandidateMethod: detection.method, candidateConfidence: detection.confidence })
      await renderPage(page.id, page.file, detection.corners, page.mode, page.rotation, detection.corners, detection.confidence)
    } catch (error) {
      emitDiagnostic('[S&SA detection fallback]', { stage: 'prepare-page', error: serializeDiagnosticError(error) }, 'warn')
      const corners = fullImageCorners()
      emitDiagnostic('[S&SA detection UI result]', { ...identity, resultState: 'full-image-fallback', editorCorners: corners, cornerSource: 'full-image', selectedCandidateMethod: null, candidateConfidence: 0, geometry: { uiHandoff: describeGeometry(corners) } })
      updatePage(page.id, (current) => ({ ...current, corners, detectedCorners: corners, confidence: 0, status: 'attention', message: "S&SA couldn't find the paper automatically." }))
      setEditingPageId((current) => current ?? page.id)
    }
  }

  const addFiles = (files: FileList | null) => {
    if (!files?.length) return
    const pages = Array.from(files).map((file): ScanPage => ({
      id: makeId(), file, originalUrl: URL.createObjectURL(file), rotation: 0, mode: 'auto', status: 'preparing',
      corners: fullImageCorners(), detectedCorners: fullImageCorners(), confidence: 0,
    }))
    pages.forEach((page) => livePageIds.current.add(page.id))
    let targetDocumentId: string
    let startingPageIndex: number
    if (currentId) {
      targetDocumentId = currentId
      startingPageIndex = currentDocument?.pages.length ?? 0
      setDocuments((existing) => existing.map((doc) => doc.id === currentId ? { ...doc, pages: [...doc.pages, ...pages] } : doc))
    } else {
      const doc = { ...createDocument(), pages }
      targetDocumentId = doc.id
      startingPageIndex = 0
      setCurrentId(doc.id)
      setDocuments((existing) => [...existing, doc])
    }
    setView('review')
    void (async () => {
      for (const [index, page] of pages.entries()) {
        const pageIndex = startingPageIndex + index
        await preparePage(page, { pageId: page.id, documentId: targetDocumentId, pageIndex, pageNumber: pageIndex + 1 })
      }
    })()
  }

  const handleInput = (event: React.ChangeEvent<HTMLInputElement>) => { addFiles(event.target.files); event.target.value = '' }
  const updateCurrentPages = (update: (pages: ScanPage[]) => ScanPage[]) => {
    if (!currentId) return
    setDocuments((existing) => existing.map((doc) => doc.id === currentId ? { ...doc, pages: update(doc.pages) } : doc))
  }

  const movePage = (pageId: string, direction: -1 | 1) => updateCurrentPages((pages) => {
    const from = pages.findIndex((page) => page.id === pageId)
    const to = from + direction
    if (from < 0 || to < 0 || to >= pages.length) return pages
    const next = [...pages]
    const [page] = next.splice(from, 1)
    next.splice(to, 0, page)
    return next
  })

  const dropPage = (targetId: string) => {
    if (!draggedId || draggedId === targetId) return
    updateCurrentPages((pages) => {
      const from = pages.findIndex((page) => page.id === draggedId)
      const to = pages.findIndex((page) => page.id === targetId)
      if (from < 0 || to < 0) return pages
      const next = [...pages]
      const [page] = next.splice(from, 1)
      next.splice(to, 0, page)
      return next
    })
    setDraggedId(null)
  }

  const removePage = (pageId: string) => updateCurrentPages((pages) => {
    const page = pages.find((item) => item.id === pageId)
    if (page) { livePageIds.current.delete(pageId); URL.revokeObjectURL(page.originalUrl); if (page.processedUrl) URL.revokeObjectURL(page.processedUrl) }
    return pages.filter((item) => item.id !== pageId)
  })

  const reprocess = (page: ScanPage, changes: Partial<Pick<ScanPage, 'corners' | 'mode' | 'rotation'>>) => {
    const next = { ...page, ...changes }
    void renderPage(page.id, page.file, next.corners, next.mode, next.rotation, next.detectedCorners, next.confidence)
  }

  const applyManualEdges = async (page: ScanPage, corners: Point[]) => {
    emitDiagnostic('[S&SA apply checkpoint]', { operation: 'manual-corners-state', phase: 'before', normalizedCorners: corners, mode: page.mode, rotation: page.rotation })
    updatePage(page.id, (current) => ({ ...current, corners }))
    emitDiagnostic('[S&SA apply checkpoint]', { operation: 'manual-corners-state', phase: 'after', normalizedCorners: corners })
    const succeeded = await renderPage(page.id, page.file, corners, page.mode, page.rotation, page.detectedCorners, page.confidence, 'manual-apply')
    emitDiagnostic('[S&SA apply checkpoint]', { operation: 'render-page-result', phase: 'after', succeeded })
    if (succeeded) {
      emitDiagnostic('[S&SA apply checkpoint]', { operation: 'editor-close', phase: 'before' })
      setEditingPageId(null)
      emitDiagnostic('[S&SA apply checkpoint]', { operation: 'editor-close', phase: 'after' })
    }
    return succeeded
  }

  const startNewDocument = () => {
    const doc = createDocument()
    setDocuments((existing) => [...existing, doc])
    setCurrentId(doc.id)
  }

  const createPdfs = async () => {
    setCreatingPdfs(true)
    pdfs.forEach((pdf) => URL.revokeObjectURL(pdf.url))
    try {
      const results: PdfResult[] = []
      for (let index = 0; index < filledDocuments.length; index += 1) {
        const doc = filledDocuments[index]
        const processedPages = doc.pages.flatMap((page) => page.processed ? [page.processed] : [])
        if (processedPages.length !== doc.pages.length) continue
        const blob = await createDocumentPdf(processedPages)
        results.push({ documentId: doc.id, url: URL.createObjectURL(blob), name: `Scan-${index + 1}.pdf` })
      }
      setPdfs(results)
    } finally { setCreatingPdfs(false) }
  }

  return (
    <div className={`workspace-page scan-workspace scan-workspace--${view}`}>
      {view === 'intake' && <ScanIntake onCamera={() => cameraInput.current?.click()} onFiles={() => fileInput.current?.click()} />}

      {view === 'review' && (
        <>
          <header className="review-header">
            <div><p className="kicker">Scan paper</p><h1>Review your pages.</h1><p>S&SA finds the paper, straightens it, and cleans it up while keeping your original photo untouched.</p></div>
            <button className="finish-button" type="button" onClick={() => setView('summary')} disabled={!totalPages || processing} title={processing ? 'Finish checking every page first' : undefined}>Finish <Check size={19} /></button>
          </header>
          <DocumentTabs documents={documents} currentId={currentId} onSelect={setCurrentId} />
          <section className="page-review" aria-label="Pages in current document">
            <div className="page-review-heading">
              <div><p className="document-label">Document {Math.max(1, documents.findIndex((doc) => doc.id === currentId) + 1)}</p><h2>{currentDocument?.pages.length ?? 0} {(currentDocument?.pages.length ?? 0) === 1 ? 'page' : 'pages'}</h2></div>
              <p><GripVertical size={17} /> Drag pages or use the arrow buttons to reorder.</p>
            </div>
            {currentDocument?.pages.length ? <div className="page-grid">{currentDocument.pages.map((page, index) => (
              <PageCard key={page.id} page={page} index={index} count={currentDocument.pages.length} isDragging={draggedId === page.id}
                onReview={() => setReviewingPageId(page.id)} onAdjust={() => setEditingPageId(page.id)}
                onDragStart={() => setDraggedId(page.id)} onDragEnd={() => setDraggedId(null)} onDrop={() => dropPage(page.id)} onMove={(direction) => movePage(page.id, direction)}
                onMode={(mode) => reprocess(page, { mode })} onRotate={(amount) => reprocess(page, { rotation: (page.rotation + amount + 360) % 360 })}
                onRemove={() => removePage(page.id)} />
            ))}</div> : <div className="empty-document"><FilePlus2 size={34} /><h2>This document is ready for its first page.</h2><p>Take a photo or choose one from your device.</p></div>}
          </section>
          <div className="review-actions" aria-label="Document actions">
            <button className="primary-button" type="button" onClick={() => cameraInput.current?.click()}><Camera size={20} /> Add another page</button>
            <button className="secondary-button" type="button" onClick={() => fileInput.current?.click()}><Images size={20} /> Choose existing photos</button>
            <button className="text-action" type="button" onClick={startNewDocument} disabled={!currentDocument?.pages.length}><FilePlus2 size={19} /> New document</button>
          </div>
          <div className="review-footer"><p className="trust-line"><span aria-hidden="true">●</span> Originals are never cropped, filtered, or overwritten.</p><button className="finish-button finish-button--mobile" type="button" onClick={() => setView('summary')} disabled={!totalPages || processing}>Finish <Check size={19} /></button></div>
        </>
      )}

      {view === 'summary' && <ScanSummary documents={filledDocuments} totalPages={totalPages} pdfs={pdfs} creatingPdfs={creatingPdfs} onCreatePdfs={createPdfs} onEdit={() => setView('review')} />}

      {editingPage && <CornerEditor imageUrl={editingPage.originalUrl} corners={editingPage.corners} detectedCorners={editingPage.detectedCorners} diagnosticIdentity={{ pageId: editingPage.id, documentId: editingDocument?.id, pageIndex: Math.max(0, editingPageIndex), pageNumber: Math.max(1, editingPageIndex + 1) }} uiHandoffCorners={editingPage.detectedCorners} onClose={() => setEditingPageId(null)} onApply={(corners) => applyManualEdges(editingPage, corners)} />}
      {reviewingPage && <PageComparison pageNumber={(currentDocument?.pages.findIndex((page) => page.id === reviewingPage.id) ?? 0) + 1} originalUrl={reviewingPage.originalUrl} processedUrl={reviewingPage.processedUrl} needsAttention={reviewingPage.status === 'attention'} onClose={() => setReviewingPageId(null)} onAdjust={() => { setReviewingPageId(null); setEditingPageId(reviewingPage.id) }} />}

      <input ref={cameraInput} className="visually-hidden" type="file" accept={acceptedImages} capture="environment" onChange={handleInput} />
      <input ref={fileInput} className="visually-hidden" type="file" accept={acceptedImages} multiple onChange={handleInput} />
      <DiagnosticsPanel />
    </div>
  )
}

function ScanIntake({ onCamera, onFiles }: { onCamera: () => void; onFiles: () => void }) {
  return <><PageIntro kicker="Scan paper" title="Make paper easier to keep.">Take a picture now, or choose photos you already have. Add as many pages as the document needs.</PageIntro><section className="scan-stage" aria-label="Add document pages"><div className="paper-preview" aria-hidden="true"><div className="paper-corner" /><ScanLineArt /><span>Page 1</span></div><div className="scan-actions"><button className="primary-button" type="button" onClick={onCamera}><Camera size={22} /> Take a picture</button><button className="secondary-button" type="button" onClick={onFiles}><Images size={22} /> Choose photos or files</button><p className="add-pages"><Plus size={17} /> Front and back? Add each side as a page.</p></div></section><p className="trust-line"><span aria-hidden="true">●</span> Your original photos are never changed.</p></>
}

function DocumentTabs({ documents, currentId, onSelect }: { documents: ScanDocument[]; currentId: string | null; onSelect: (id: string) => void }) {
  return <nav className="document-tabs" aria-label="Documents in this scan session">{documents.map((doc, index) => <button key={doc.id} className={doc.id === currentId ? 'active' : ''} type="button" onClick={() => onSelect(doc.id)} aria-current={doc.id === currentId ? 'page' : undefined}><span>Document {index + 1}</span><small>{doc.pages.length} {doc.pages.length === 1 ? 'page' : 'pages'}</small></button>)}</nav>
}

function PageCard({ page, index, count, isDragging, onReview, onAdjust, onDragStart, onDragEnd, onDrop, onMove, onMode, onRotate, onRemove }: { page: ScanPage; index: number; count: number; isDragging: boolean; onReview: () => void; onAdjust: () => void; onDragStart: () => void; onDragEnd: () => void; onDrop: () => void; onMove: (direction: -1 | 1) => void; onMode: (mode: ProcessingMode) => void; onRotate: (amount: number) => void; onRemove: () => void }) {
  const pending = page.status !== 'ready' && page.status !== 'attention'
  return <article className={`page-card${isDragging ? ' is-dragging' : ''}${page.status === 'attention' ? ' needs-attention' : ''}`} draggable={!pending} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); onDrop() }}>
    <button className="page-image-wrap" type="button" onClick={onReview} aria-label={`Review page ${index + 1}`}>
      <img src={page.processedUrl ?? page.originalUrl} alt={`Page ${index + 1}: ${page.file.name}`} />
      <span className="page-number">Page {index + 1}</span><span className="drag-handle"><GripVertical size={20} /></span>
      {pending && <span className="processing-scrim"><ScanLine size={24} /><span>{statusLabels[page.status]}</span></span>}
    </button>
    <div className={`page-status page-status--${page.status}`}><span aria-hidden="true" />{statusLabels[page.status]}</div>
    {page.message && <p className="page-message">{page.message}</p>}
    <div className="page-mode"><label htmlFor={`mode-${page.id}`}>Look</label><select id={`mode-${page.id}`} value={page.mode} disabled={pending} onChange={(event) => onMode(event.target.value as ProcessingMode)}>{Object.entries(modeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
    <button className="adjust-edges" type="button" onClick={onAdjust}>Adjust edges</button>
    <div className="page-card-actions"><div className="icon-action-group"><button type="button" onClick={() => onRotate(-90)} disabled={pending} aria-label={`Rotate page ${index + 1} left`}><RotateCcw size={18} /></button><button type="button" onClick={() => onRotate(90)} disabled={pending} aria-label={`Rotate page ${index + 1} right`}><RotateCw size={18} /></button></div><div className="icon-action-group"><button type="button" onClick={() => onMove(-1)} disabled={index === 0} aria-label={`Move page ${index + 1} earlier`}><ChevronLeft size={19} /></button><button type="button" onClick={() => onMove(1)} disabled={index === count - 1} aria-label={`Move page ${index + 1} later`}><ChevronRight size={19} /></button></div><button className="remove-page" type="button" onClick={onRemove} aria-label={`Remove page ${index + 1}`}><Trash2 size={18} /></button></div>
  </article>
}

function ScanSummary({ documents, totalPages, pdfs, creatingPdfs, onCreatePdfs, onEdit }: { documents: ScanDocument[]; totalPages: number; pdfs: PdfResult[]; creatingPdfs: boolean; onCreatePdfs: () => void; onEdit: () => void }) {
  return <><header className="summary-header"><p className="kicker">Scan summary</p><h1>Your pages are ready.</h1><p>Each document will become its own PDF. Your original photos remain untouched.</p></header><section className="summary-totals"><div><strong>{documents.length}</strong><span>{documents.length === 1 ? 'document' : 'documents'}</span></div><div><strong>{totalPages}</strong><span>{totalPages === 1 ? 'page' : 'pages'} total</span></div></section><div className="summary-documents">{documents.map((doc, index) => { const pdf = pdfs.find((item) => item.documentId === doc.id); return <article className="summary-document" key={doc.id}><div className="summary-preview">{doc.pages.slice(0, 3).reverse().map((page, layer) => <img key={page.id} src={page.processedUrl ?? page.originalUrl} alt={layer === doc.pages.slice(0, 3).length - 1 ? `First page of document ${index + 1}` : ''} style={{ transform: `translate(${layer * 5}px, ${-layer * 4}px)` }} />)}</div><div><p className="document-label">Document {index + 1}</p><h2>{doc.pages.length} {doc.pages.length === 1 ? 'page' : 'pages'}</h2>{pdf ? <a className="download-pdf" href={pdf.url} download={pdf.name}><Download size={18} /> Download {pdf.name}</a> : <p>Ready to create.</p>}</div></article> })}</div><div className="summary-actions"><button className="secondary-button" type="button" onClick={onEdit}>Return and edit</button><button className="primary-button" type="button" onClick={onCreatePdfs} disabled={creatingPdfs}>{creatingPdfs ? 'Creating PDFs…' : pdfs.length ? 'Create PDFs again' : 'Create PDF'}</button></div></>
}

function ScanLineArt() { return <svg viewBox="0 0 180 220" fill="none" aria-hidden="true"><path d="M28 1H6a5 5 0 0 0-5 5v22M152 1h22a5 5 0 0 1 5 5v22M28 219H6a5 5 0 0 1-5-5v-22M152 219h22a5 5 0 0 0 5-5v-22" stroke="currentColor" strokeWidth="2" /><path d="M40 46h100M40 67h77M40 108h100M40 129h89M40 150h100" stroke="currentColor" strokeWidth="3" strokeLinecap="round" opacity=".28" /><rect x="40" y="84" width="45" height="7" rx="3.5" fill="currentColor" opacity=".55" /></svg> }
