import { useEffect, useRef, useState } from 'react'
import { emitDiagnostic } from '../document-processing/diagnostics'
import { describeGeometry, describeGeometryTransition } from '../document-processing/geometry-diagnostics'
import type { Point } from '../document-processing/types'

type CornerEditorProps = {
  imageUrl: string
  corners: Point[]
  detectedCorners: Point[]
  diagnosticIdentity: { pageId: string; documentId?: string; pageIndex: number; pageNumber: number }
  uiHandoffCorners: Point[]
  onApply: (corners: Point[]) => Promise<boolean>
  onClose: () => void
}

export function CornerEditor({ imageUrl, corners, detectedCorners, diagnosticIdentity, uiHandoffCorners, onApply, onClose }: CornerEditorProps) {
  const [draft, setDraft] = useState(corners)
  const [applying, setApplying] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [imageLoaded, setImageLoaded] = useState(false)
  const overlayRef = useRef<HTMLDivElement>(null)
  const imageRef = useRef<HTMLImageElement>(null)
  const lastRenderDiagnostic = useRef('')
  const activePointer = useRef<{ pointerId: number; corner: number } | null>(null)

  useEffect(() => setDraft(corners), [corners])

  useEffect(() => {
    const transition = describeGeometryTransition(uiHandoffCorners, corners)
    const inputGeometry = describeGeometry(corners)
    emitDiagnostic('[S&SA CornerEditor geometry]', { ...diagnosticIdentity, stage: 'CornerEditor-input', uiHandoff: describeGeometry(uiHandoffCorners), cornerEditorInput: inputGeometry, transition })
    if (transition.cornerOrderChanged || transition.becameNonConvex || transition.becameSelfIntersecting || !inputGeometry.convex || inputGeometry.selfIntersecting) {
      emitDiagnostic('[S&SA GEOMETRY WARNING]', { ...diagnosticIdentity, transition: 'ui-handoff-to-CornerEditor-input', analysis: transition, from: describeGeometry(uiHandoffCorners), to: inputGeometry }, 'error')
    }
  }, [corners, diagnosticIdentity.documentId, diagnosticIdentity.pageId, diagnosticIdentity.pageIndex, diagnosticIdentity.pageNumber, uiHandoffCorners])

  useEffect(() => {
    const emitRenderedGeometry = () => {
      const image = imageRef.current; const overlay = overlayRef.current
      if (!image || !overlay || !image.complete || !image.naturalWidth) return
      const bounds = overlay.getBoundingClientRect()
      if (!bounds.width || !bounds.height) return
      const renderedPoints = corners.map((point) => ({ x: bounds.left + point.x * bounds.width, y: bounds.top + point.y * bounds.height }))
      const signature = JSON.stringify([image.naturalWidth, image.naturalHeight, bounds.left, bounds.top, bounds.width, bounds.height, renderedPoints])
      if (signature === lastRenderDiagnostic.current) return
      lastRenderDiagnostic.current = signature
      const renderedGeometry = describeGeometry(renderedPoints)
      emitDiagnostic('[S&SA CornerEditor geometry]', {
        ...diagnosticIdentity, stage: 'rendered-handles', intrinsicImage: { width: image.naturalWidth, height: image.naturalHeight },
        renderedImageBounds: { left: bounds.left, top: bounds.top, right: bounds.right, bottom: bounds.bottom, width: bounds.width, height: bounds.height },
        cornerEditorInput: describeGeometry(corners), renderedHandles: renderedGeometry,
      })
      const inputGeometry = describeGeometry(corners)
      if ((inputGeometry.convex && !renderedGeometry.convex) || (!inputGeometry.selfIntersecting && renderedGeometry.selfIntersecting)) {
        emitDiagnostic('[S&SA GEOMETRY WARNING]', { ...diagnosticIdentity, transition: 'CornerEditor-input-to-rendered-handle-coordinates', from: inputGeometry, to: renderedGeometry }, 'error')
      }
    }
    const frame = overlayRef.current
    const observer = typeof ResizeObserver === 'function' && frame ? new ResizeObserver(emitRenderedGeometry) : null
    if (observer && frame) observer.observe(frame)
    window.addEventListener('resize', emitRenderedGeometry)
    const frameId = requestAnimationFrame(emitRenderedGeometry)
    return () => { observer?.disconnect(); window.removeEventListener('resize', emitRenderedGeometry); cancelAnimationFrame(frameId) }
  }, [corners, diagnosticIdentity.documentId, diagnosticIdentity.pageId, diagnosticIdentity.pageIndex, diagnosticIdentity.pageNumber, imageLoaded])

  const startCornerDrag = (corner: number, event: React.PointerEvent<HTMLButtonElement>) => {
    if (applying) return
    event.preventDefault()
    event.stopPropagation()
    activePointer.current = { pointerId: event.pointerId, corner }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const moveCorner = (corner: number, event: React.PointerEvent<HTMLButtonElement>) => {
    if (applying || activePointer.current?.pointerId !== event.pointerId || activePointer.current.corner !== corner) return
    event.preventDefault()
    event.stopPropagation()
    const rect = overlayRef.current?.getBoundingClientRect()
    if (!rect) return
    setDraft((current) => {
      const next = [...current]
      next[corner] = {
        x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
        y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)),
      }
      return next
    })
  }

  const endCornerDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (activePointer.current?.pointerId !== event.pointerId) return
    event.preventDefault()
    event.stopPropagation()
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    activePointer.current = null
  }

  const apply = async () => {
    if (applying) return
    setApplying(true)
    setError(null)
    try {
      const succeeded = await onApply(draft)
      if (succeeded) return
      setError("S&SA couldn't apply those edges. Your corners are still here—try again or use the full image.")
      setApplying(false)
    } catch {
      setError("S&SA couldn't apply those edges. Your corners are still here—try again or use the full image.")
      setApplying(false)
    }
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="edge-editor" role="dialog" aria-modal="true" aria-labelledby="edge-title">
        <header>
          <div><p className="kicker">Adjust edges</p><h2 id="edge-title">Move the corners to the edges of your paper.</h2></div>
          <button className="modal-close" type="button" onClick={onClose} disabled={applying} aria-label="Close edge adjustment">×</button>
        </header>

        <div className="edge-image-stage">
          <div className="edge-image-frame">
            <img ref={imageRef} src={imageUrl} alt="Original document photo for edge adjustment" draggable={false} onLoad={() => setImageLoaded(true)} onDragStart={(event) => event.preventDefault()} />
            <div
              ref={overlayRef}
              className="edge-overlay"
              onPointerDown={(event) => event.preventDefault()}
              onContextMenu={(event) => event.preventDefault()}
            >
              <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                <polygon points={draft.map((point) => `${point.x * 100},${point.y * 100}`).join(' ')} />
              </svg>
              {draft.map((point, index) => (
                <button
                  key={index}
                  className="corner-handle"
                  style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%` }}
                  type="button"
                  disabled={applying}
                  aria-label={`Move corner ${index + 1}`}
                  onPointerDown={(event) => startCornerDrag(index, event)}
                  onPointerMove={(event) => moveCorner(index, event)}
                  onPointerUp={endCornerDrag}
                  onPointerCancel={endCornerDrag}
                  onLostPointerCapture={() => { activePointer.current = null }}
                />
              ))}
            </div>
          </div>
        </div>

        {error ? <p className="edge-error" role="alert">{error}</p> : null}
        {applying ? <p className="edge-applying" role="status">Applying your edges…</p> : null}

        <footer>
          <div className="edge-secondary-actions">
            <button type="button" disabled={applying} onClick={() => setDraft(detectedCorners)}>Reset to detected edges</button>
            <button type="button" disabled={applying} onClick={() => setDraft([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }])}>Use full image</button>
          </div>
          <button className="primary-button" type="button" disabled={applying} onClick={apply}>{applying ? 'Applying…' : 'Apply'}</button>
        </footer>
      </section>
    </div>
  )
}
