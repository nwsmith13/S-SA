import type { Point } from './types'

export type CandidateQualityAssessment = {
  accepted: boolean
  originalScore: number
  areaRatio: number
  borderThreshold: number
  borderCornerCount: number
  touchedSides: Array<'left' | 'right' | 'top' | 'bottom'>
  edgeBalance: number
  convex: boolean
  reasons: string[]
}

const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y)

function area(points: Point[]) {
  return Math.abs(points.reduce((sum, point, index) => {
    const next = points[(index + 1) % points.length]
    return sum + point.x * next.y - next.x * point.y
  }, 0) / 2)
}

function isConvex(points: Point[]) {
  const signs = points.map((point, index) => {
    const next = points[(index + 1) % points.length]
    const after = points[(index + 2) % points.length]
    return Math.sign((next.x - point.x) * (after.y - next.y) - (next.y - point.y) * (after.x - next.x))
  }).filter(Boolean)
  return signs.length === 4 && signs.every((sign) => sign === signs[0])
}

export function assessCandidateQuality(points: Point[], originalScore: number): CandidateQualityAssessment {
  const borderThreshold = .02
  const areaRatio = area(points)
  const borderCornerCount = points.filter((point) => Math.min(point.x, point.y, 1 - point.x, 1 - point.y) <= borderThreshold).length
  const touchedSides = (['left', 'right', 'top', 'bottom'] as const).filter((side) => points.some((point) => {
    if (side === 'left') return point.x <= borderThreshold
    if (side === 'right') return 1 - point.x <= borderThreshold
    if (side === 'top') return point.y <= borderThreshold
    return 1 - point.y <= borderThreshold
  }))
  const edgeLengths = points.map((point, index) => distance(point, points[(index + 1) % points.length]))
  const edgeBalance = Math.min(...edgeLengths) / Math.max(...edgeLengths)
  const convex = isConvex(points)
  const reasons: string[] = []

  if (!convex) reasons.push('non-convex-quadrilateral')
  if (areaRatio >= .65 && borderCornerCount >= 3) reasons.push('large-region-with-three-border-corners')
  if (areaRatio >= .65 && touchedSides.length >= 3) reasons.push('large-region-touching-three-image-sides')
  if (areaRatio >= .55 && borderCornerCount >= 2 && edgeBalance < .25) reasons.push('large-border-region-with-implausible-edge-balance')

  return { accepted: reasons.length === 0, originalScore, areaRatio, borderThreshold, borderCornerCount, touchedSides, edgeBalance, convex, reasons }
}
