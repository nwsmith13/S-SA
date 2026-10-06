import { Files, ScanLine } from 'lucide-react'
import { ActionRow } from '../components/ActionRow'

export function HomePage() {
  return (
    <div className="home-page">
      <section className="home-intro">
        <p className="kicker">Save &amp; Save As</p>
        <h1>
          Because <span>FINAL_final_v2_</span><span>USE_THIS_ONE.pdf</span><br />{' '}
          isn’t a filing system.
        </h1>
        <p className="home-lede">Start with what you have. We’ll help make it useful.</p>
      </section>

      <section className="home-actions" aria-label="Choose how to begin">
        <ActionRow
          eyebrow="01"
          title="Scan Paper"
          description="Turn paper into clean, organized documents."
          to="/scan"
          icon={ScanLine}
          tone="coral"
        />
        <ActionRow
          eyebrow="02"
          title="Clean Up Files"
          description="Find duplicates, versions, and files with names only their creator understands."
          to="/cleanup"
          icon={Files}
          tone="ink"
        />
      </section>

      <footer className="home-footnote">
        <span aria-hidden="true">✦</span>
        <p>Nothing gets changed behind your back. You’ll always review first.</p>
      </footer>
    </div>
  )
}
