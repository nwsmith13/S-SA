import { useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { getDiagnosticEvents, subscribeToDiagnostics, type DiagnosticEvent } from '../document-processing/diagnostics'

function latest(events: DiagnosticEvent[], labels: string[]) {
  return [...events].reverse().find((event) => labels.includes(event.label)) ?? null
}

export function DiagnosticsPanel() {
  const events = useSyncExternalStore(subscribeToDiagnostics, getDiagnosticEvents, getDiagnosticEvents)
  const textarea = useRef<HTMLTextAreaElement>(null)
  const [copyStatus, setCopyStatus] = useState('')
  const enabled = import.meta.env.DEV || new URLSearchParams(window.location.search).get('diagnostics') === '1'

  const detection = latest(events, ['[S&SA detection diagnostics]'])
  const detectionFailure = latest(events, ['[S&SA detection failure]'])
  const processingFailure = latest(events, ['[S&SA processing failure]'])
  const applyEvents = events.filter((event) => event.label === '[S&SA apply checkpoint]')
  const diagnosticText = useMemo(() => JSON.stringify({
    generatedAt: new Date().toISOString(),
    userAgent: navigator.userAgent,
    latestDetection: detection,
    latestDetectionFailure: detectionFailure,
    latestProcessingFailure: processingFailure,
    applyCheckpoints: applyEvents,
    events,
  }, null, 2), [applyEvents, detection, detectionFailure, events, processingFailure])

  if (!enabled) return null

  const copyDiagnostics = async () => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard API unavailable')
      await navigator.clipboard.writeText(diagnosticText)
      setCopyStatus('Copied')
    } catch {
      setCopyStatus('Select the text below and copy it manually.')
      requestAnimationFrame(() => { textarea.current?.focus(); textarea.current?.select() })
    }
  }

  return (
    <details className="diagnostics-panel">
      <summary>Diagnostics</summary>
      <div className="diagnostics-panel__body">
        <p>Temporary scanner debugging. No document image or document contents are included.</p>
        <DiagnosticSection title="Latest detection" event={detection} />
        <DiagnosticSection title="Latest detection failure" event={detectionFailure} />
        <DiagnosticSection title="Latest processing failure" event={processingFailure} />
        <section>
          <h3>Apply checkpoints</h3>
          <pre>{applyEvents.length ? JSON.stringify(applyEvents, null, 2) : 'No Apply attempt captured yet.'}</pre>
        </section>
        <button type="button" onClick={copyDiagnostics}>Copy diagnostics</button>
        {copyStatus ? <p role="status">{copyStatus}</p> : null}
        <label htmlFor="scan-diagnostics-copy">Manual copy</label>
        <textarea ref={textarea} id="scan-diagnostics-copy" readOnly value={diagnosticText} onFocus={(event) => event.currentTarget.select()} />
      </div>
    </details>
  )
}

function DiagnosticSection({ title, event }: { title: string; event: DiagnosticEvent | null }) {
  return <section><h3>{title}</h3><pre>{event ? JSON.stringify(event, null, 2) : 'Nothing captured yet.'}</pre></section>
}
