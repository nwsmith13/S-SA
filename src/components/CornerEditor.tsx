import { useEffect, useState } from 'react'
import type { Point } from '../document-processing/types'

type CornerEditorProps = {
  imageUrl: string
  corners: Point[]
  detectedCorners: Point[]
  onApply: (corners: Point[]) => Promise<boolean>
  onClose: () => void
}

export function CornerEditor({ imageUrl, corners, detectedCorners, onApply, onClose }: CornerEditorProps) {
  const [draft, setDraft] = useState(corners)
  const [activeCorner, setActiveCorner] = useState<number | null>(null)
  const [applying, setApplying] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => setDraft(corners), [corners])

  const moveCorner = (event: React.PointerEvent<HTMLDivElement>) => {
    if (activeCorner === null || applying) return
    const rect = event.currentTarget.getBoundingClientRect()
    const next = [...draft]
    next[activeCorner] = {
      x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)),
    }
    setDraft(next)
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

        <div className="edge-image-frame">
          <img src={imageUrl} alt="Original document photo for edge adjustment" draggable={false} />
          <div
            className="edge-overlay"
            onPointerMove={moveCorner}
            onPointerUp={() => setActiveCorner(null)}
            onPointerCancel={() => setActiveCorner(null)}
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
                onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); setActiveCorner(index) }}
              />
            ))}
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
