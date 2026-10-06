import { FileUp, FolderOpen, ShieldCheck } from 'lucide-react'
import { useRef, useState, type DragEvent } from 'react'
import { PageIntro } from '../components/PageIntro'

export function CleanupPage() {
  const input = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [selection, setSelection] = useState<string | null>(null)

  const describeFiles = (files: FileList) => {
    if (files.length) setSelection(`${files.length} ${files.length === 1 ? 'file' : 'files'} ready for review`)
  }

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setIsDragging(false)
    describeFiles(event.dataTransfer.files)
  }

  return (
    <div className="workspace-page cleanup-page">
      <PageIntro kicker="Clean up files" title="Bring the messy folder.">
        We’ll sort out the mystery names and look for copies and versions. You decide what happens next.
      </PageIntro>

      <div
        className={`drop-zone${isDragging ? ' is-dragging' : ''}`}
        onDragEnter={(event) => { event.preventDefault(); setIsDragging(true) }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
      >
        <FileUp size={46} strokeWidth={1.4} aria-hidden="true" />
        <h2>Drop files here</h2>
        <p>Documents, photos, or a whole handful at once.</p>
        <span className="or-divider">or</span>
        <button className="primary-button" type="button" onClick={() => input.current?.click()}>
          <FolderOpen size={21} aria-hidden="true" /> Choose files
        </button>
        <input ref={input} className="visually-hidden" type="file" multiple onChange={(event) => event.target.files && describeFiles(event.target.files)} />
        {selection ? <p className="selection-note" role="status">{selection}</p> : null}
      </div>

      <aside className="safety-panel">
        <ShieldCheck size={28} aria-hidden="true" />
        <div>
          <strong>Your originals are safe.</strong>
          <p>S&amp;SA won’t change, rename, move, or delete anything while it looks through your files.</p>
        </div>
      </aside>
    </div>
  )
}
