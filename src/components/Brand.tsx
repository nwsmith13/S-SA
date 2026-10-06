import { Link } from 'react-router-dom'

export function Brand() {
  return (
    <Link className="brand" to="/" aria-label="S and S A home">
      <span>S</span><i>&amp;</i><span>SA</span>
    </Link>
  )
}
