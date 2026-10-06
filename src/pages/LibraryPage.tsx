import { FileCheck2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { PageIntro } from '../components/PageIntro'

export function LibraryPage() {
  return (
    <div className="workspace-page library-page">
      <PageIntro kicker="Library" title="A home for the documents worth keeping.">
        Once you scan or clean up files, the organized results will appear here.
      </PageIntro>

      <section className="library-empty">
        <div className="empty-mark" aria-hidden="true"><FileCheck2 size={48} strokeWidth={1.35} /></div>
        <h2>Quiet in here—for now.</h2>
        <p>Your library will grow as you bring in paper and files.</p>
        <div className="empty-actions">
          <Link className="primary-button" to="/scan">Scan paper</Link>
          <Link className="text-link" to="/cleanup">Clean up files</Link>
        </div>
      </section>
    </div>
  )
}
