import type { LucideIcon } from 'lucide-react'
import { ArrowUpRight } from 'lucide-react'
import { Link } from 'react-router-dom'

type ActionRowProps = {
  eyebrow: string
  title: string
  description: string
  to: string
  icon: LucideIcon
  tone: 'coral' | 'ink'
}

export function ActionRow({ eyebrow, title, description, to, icon: Icon, tone }: ActionRowProps) {
  return (
    <Link className={`action-row action-row--${tone}`} to={to}>
      <span className="action-number">{eyebrow}</span>
      <span className="action-icon" aria-hidden="true"><Icon size={34} strokeWidth={1.6} /></span>
      <span className="action-copy">
        <strong>{title}</strong>
        <span>{description}</span>
      </span>
      <ArrowUpRight className="action-arrow" size={28} aria-hidden="true" />
    </Link>
  )
}
