import { useState } from 'react'

type PageComparisonProps = {
  pageNumber: number
  originalUrl: string
  processedUrl?: string
  needsAttention: boolean
  onAdjust: () => void
  onClose: () => void
}

export function PageComparison({ pageNumber, originalUrl, processedUrl, needsAttention, onAdjust, onClose }: PageComparisonProps) {
  const [view, setView] = useState<'original' | 'processed'>(processedUrl ? 'processed' : 'original')
  return (
    <div className="modal-backdrop" role="presentation">
      <section className="comparison-modal" role="dialog" aria-modal="true" aria-labelledby="comparison-title">
        <header>
          <div><p className="kicker">Page {pageNumber}</p><h2 id="comparison-title">Review this page.</h2></div>
          <button className="modal-close" type="button" onClick={onClose} aria-label="Close page review">×</button>
        </header>
        <div className="comparison-switch" aria-label="Choose page view">
          <button className={view === 'original' ? 'active' : ''} type="button" onClick={() => setView('original')}>Original</button>
          <button className={view === 'processed' ? 'active' : ''} type="button" onClick={() => setView('processed')} disabled={!processedUrl}>Processed</button>
        </div>
        <div className="comparison-image">
          <img src={view === 'processed' && processedUrl ? processedUrl : originalUrl} alt={`${view === 'processed' ? 'Processed scan' : 'Original photo'} of page ${pageNumber}`} />
        </div>
        <footer>
          <p>{needsAttention ? 'Check the edges before using this page.' : 'Your original photo remains untouched.'}</p>
          <button className="secondary-button" type="button" onClick={onAdjust}>Adjust edges</button>
        </footer>
      </section>
    </div>
  )
}
