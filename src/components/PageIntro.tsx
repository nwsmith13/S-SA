import type { ReactNode } from 'react'

type PageIntroProps = {
  kicker: string
  title: string
  children: ReactNode
}

export function PageIntro({ kicker, title, children }: PageIntroProps) {
  return (
    <header className="page-intro">
      <p className="kicker">{kicker}</p>
      <h1>{title}</h1>
      <p>{children}</p>
    </header>
  )
}
