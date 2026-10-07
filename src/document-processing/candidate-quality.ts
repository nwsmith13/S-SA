import type { Point } from './types'

export type CandidateQualityAssessment = {
  accepted: boolean
  originalScore: number
  areaRatio: number
  borderThreshold: number
  borderCornerCount: number
  touchedSides: Array<'left' | 'right' | 'top' | 'bottom'>
  boundaryFollowingEdges: Array<{ side: 'left' | 'right' | 'top' | 'bottom'; length: number }>
  edgeBalance: number
  convex: boolean
  requiresIndependentAgreement: boolean
  reasons: string[]
}

export type CandidateAgreement = { corroborated: boolean; independentCandidateFound: boolean; materialConflict: boolean; comparisonMethod?: string; comparisonScore?: number; meanCornerDistance?: number; maximumCornerDistance?: number }

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
  const boundaryFollowingEdges = points.flatMap((point, index) => {
    const next = points[(index + 1) % points.length]
    const length = distance(point, next)
    if (length < .45) return []
    const side = (['left', 'right', 'top', 'bottom'] as const).find((candidateSide) => {
      if (candidateSide === 'left') return point.x <= borderThreshold && next.x <= borderThreshold
      if (candidateSide === 'right') return 1 - point.x <= borderThreshold && 1 - next.x <= borderThreshold
      if (candidateSide === 'top') return point.y <= borderThreshold && next.y <= borderThreshold
      return 1 - point.y <= borderThreshold && 1 - next.y <= borderThreshold
    })
    return side ? [{ side, length }] : []
  })
  const edgeBalance = Math.min(...edgeLengths) / Math.max(...edgeLengths)
  const convex = isConvex(points)
  const requiresIndependentAgreement = areaRatio >= .60 && borderCornerCount >= 2 && touchedSides.length >= 2
  const reasons: string[] = []

  if (!convex) reasons.push('non-convex-quadrilateral')
  if (areaRatio >= .65 && borderCornerCount >= 3) reasons.push('large-region-with-three-border-corners')
  if (areaRatio >= .65 && touchedSides.length >= 3) reasons.push('large-region-touching-three-image-sides')
  if (areaRatio >= .60 && borderCornerCount >= 2 && touchedSides.length >= 2 && boundaryFollowingEdges.length >= 1) reasons.push('large-region-with-edge-following-image-boundary')
  if (areaRatio >= .55 && borderCornerCount >= 2 && edgeBalance < .25) reasons.push('large-border-region-with-implausible-edge-balance')

  return { accepted: reasons.length === 0, originalScore, areaRatio, borderThreshold, borderCornerCount, touchedSides, boundaryFollowingEdges, edgeBalance, convex, requiresIndependentAgreement, reasons }
}

export function selectCandidateByQuality(candidates: Array<{ points: Point[]; score: number }>) {
  const assessments = candidates.map((candidate) => assessCandidateQuality(candidate.points, candidate.score))
  const selectedIndex = assessments.findIndex((assessment) => assessment.accepted)
  return { assessments, selectedIndex }
}

export function findIndependentAgreement(selectedIndex: number, candidates: Array<{ points: Point[]; method: string; score?: number; viable?: boolean }>): CandidateAgreement {
  const selected = candidates[selectedIndex]
  if (!selected) return { corroborated: false, independentCandidateFound: false, materialConflict: false }
  const selectedFamily = selected.method.startsWith('light') ? 'light' : 'edge'
  const comparisons = candidates.flatMap((candidate, index) => {
    const family = candidate.method.startsWith('light') ? 'light' : 'edge'
    if (index === selectedIndex || family === selectedFamily || candidate.viable === false || candidate.points.length !== selected.points.length) return []
    const distances = selected.points.map((point, corner) => distance(point, candidate.points[corner]))
    return [{ method: candidate.method, score: candidate.score, mean: distances.reduce((sum, value) => sum + value, 0) / distances.length, maximum: Math.max(...distances) }]
  }).sort((a, b) => a.mean - b.mean)
  const closest = comparisons[0]
  if (!closest) return { corroborated: false, independentCandidateFound: false, materialConflict: false }
  const corroborated = closest.mean <= .035 && closest.maximum <= .06
  return { corroborated, independentCandidateFound: true, materialConflict: !corroborated, comparisonMethod: closest.method, comparisonScore: closest.score, meanCornerDistance: closest.mean, maximumCornerDistance: closest.maximum }
}

export function shouldAutoApplyCandidate(assessment: CandidateQualityAssessment, agreement: CandidateAgreement): boolean {
  return assessment.accepted
    && !agreement.materialConflict
    && (!assessment.requiresIndependentAgreement || agreement.corroborated)
}
