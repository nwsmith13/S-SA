import type { Point } from './types'

type StructuralCandidate = { method: string; score: number; points: Point[] }
const labels = ['TL', 'TR', 'BR', 'BL'] as const
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y)
const area = (points: Point[]) => Math.abs(points.reduce((sum, point, index) => { const next = points[(index + 1) % points.length]; return sum + point.x * next.y - next.x * point.y }, 0) / 2)
const bounds = (points: Point[]) => ({ left: Math.min(...points.map((point) => point.x)), top: Math.min(...points.map((point) => point.y)), right: Math.max(...points.map((point) => point.x)), bottom: Math.max(...points.map((point) => point.y)) })
const centroid = (points: Point[]) => points.reduce((sum, point) => ({ x: sum.x + point.x / points.length, y: sum.y + point.y / points.length }), { x: 0, y: 0 })
const angleDifference = (a: Point, b: Point, c: Point, d: Point) => {
  const first = Math.atan2(b.y - a.y, b.x - a.x); const second = Math.atan2(d.y - c.y, d.x - c.x)
  const raw = Math.abs(first - second) % Math.PI
  return Math.min(raw, Math.PI - raw) * 180 / Math.PI
}

function correspondences(a: Point[], b: Point[]) {
  const permutations = Array.from({ length: 4 }, (_, offset) => Array.from({ length: 4 }, (_, index) => (index + offset) % 4))
    .concat(Array.from({ length: 4 }, (_, offset) => Array.from({ length: 4 }, (_, index) => (offset - index + 4) % 4)))
  return permutations.map((mapping) => ({ mapping, distances: mapping.map((target, index) => distance(a[index], b[target])) }))
    .sort((first, second) => first.distances.reduce((sum, value) => sum + value, 0) - second.distances.reduce((sum, value) => sum + value, 0))[0]
}

export function compareCandidateStructures(candidateA: StructuralCandidate, indexA: number, candidateB: StructuralCandidate, indexB: number) {
  const areaA = area(candidateA.points); const areaB = area(candidateB.points)
  const boxA = bounds(candidateA.points); const boxB = bounds(candidateB.points)
  const centerA = centroid(candidateA.points); const centerB = centroid(candidateB.points)
  const best = correspondences(candidateA.points, candidateB.points)
  const alignedB = best.mapping.map((index) => candidateB.points[index])
  const edges = candidateA.points.map((point, index) => {
    const next = (index + 1) % 4
    const midpointA = { x: (point.x + candidateA.points[next].x) / 2, y: (point.y + candidateA.points[next].y) / 2 }
    const midpointB = { x: (alignedB[index].x + alignedB[next].x) / 2, y: (alignedB[index].y + alignedB[next].y) / 2 }
    const angleDifferenceDegrees = angleDifference(point, candidateA.points[next], alignedB[index], alignedB[next])
    const midpointDistance = distance(midpointA, midpointB)
    const lengthA = distance(point, candidateA.points[next]); const lengthB = distance(alignedB[index], alignedB[next])
    const lengthRatio = Math.min(lengthA, lengthB) / Math.max(lengthA, lengthB)
    return { edge: `${labels[index]}-${labels[next]}`, angleDifferenceDegrees, midpointDistance, lengthA, lengthB, lengthRatio, substantiallySharedOrAligned: angleDifferenceDegrees <= 8 && midpointDistance <= .06 && lengthRatio >= .65 }
  })
  const boundaryDistancesA = { top: boxA.top, right: 1 - boxA.right, bottom: 1 - boxA.bottom, left: boxA.left }
  const boundaryDistancesB = { top: boxB.top, right: 1 - boxB.right, bottom: 1 - boxB.bottom, left: boxB.left }
  const boundaryExtension = (['top', 'right', 'bottom', 'left'] as const).map((side) => {
    const delta = boundaryDistancesA[side] - boundaryDistancesB[side]
    return { side, fartherCandidate: Math.abs(delta) < 1e-9 ? 'equal' : delta > 0 ? 'B' : 'A', amount: Math.abs(delta), distanceA: boundaryDistancesA[side], distanceB: boundaryDistancesB[side] }
  })
  const sharedCornerCount = best.distances.filter((value) => value <= .04).length
  const nearCornerCount = best.distances.filter((value) => value <= .08).length
  const sharedEdgeCount = edges.filter((edge) => edge.substantiallySharedOrAligned).length
  const larger = areaB > areaA ? 'B' : 'A'; const smallerArea = Math.min(areaA, areaB); const largerArea = Math.max(areaA, areaB)
  const extensionSides = boundaryExtension.filter((entry) => entry.fartherCandidate === larger && entry.amount >= .03).map((entry) => entry.side)
  const sameStructureLikely = sharedCornerCount >= 2 || sharedEdgeCount >= 2 || (nearCornerCount >= 3 && distance(centerA, centerB) <= .15)
  return {
    candidateA: { index: indexA, method: candidateA.method, score: candidateA.score }, candidateB: { index: indexB, method: candidateB.method, score: candidateB.score },
    scoreDelta: Math.abs(candidateA.score - candidateB.score), areaRatioA: areaA, areaRatioB: areaB,
    absoluteAreaDifference: Math.abs(areaA - areaB), percentageAreaDifference: Math.abs(areaA - areaB) / Math.max(areaA, areaB) * 100,
    centroidA: centerA, centroidB: centerB, centroidDistance: distance(centerA, centerB),
    boundingBoxA: { ...boxA, width: boxA.right - boxA.left, height: boxA.bottom - boxA.top }, boundingBoxB: { ...boxB, width: boxB.right - boxB.left, height: boxB.bottom - boxB.top },
    boundingBoxDifferences: { width: Math.abs((boxA.right - boxA.left) - (boxB.right - boxB.left)), height: Math.abs((boxA.bottom - boxA.top) - (boxB.bottom - boxB.top)), left: Math.abs(boxA.left - boxB.left), top: Math.abs(boxA.top - boxB.top), right: Math.abs(boxA.right - boxB.right), bottom: Math.abs(boxA.bottom - boxB.bottom) },
    bestCornerCorrespondence: best.mapping.map((target, index) => ({ cornerA: labels[index], cornerB: labels[target], distance: best.distances[index] })),
    sharedCornerCount, nearCornerCount, cornerThresholds: { shared: .04, near: .08 }, correspondingEdges: edges, sharedEdgeCount,
    boundaryExtension,
    extensionRelationship: { sameStructureLikely, sharedCornerCount, nearCornerCount, sharedEdgeCount, extendedCandidate: sameStructureLikely && extensionSides.length ? larger : null, extensionSides, maximumExtension: Math.max(...boundaryExtension.map((entry) => entry.amount)), areaIncreasePercent: (largerArea - smallerArea) / smallerArea * 100 },
  }
}

export function compareAllAcceptedCandidates(candidates: StructuralCandidate[]) {
  const comparisons = []
  for (let first = 0; first < candidates.length; first += 1) for (let second = first + 1; second < candidates.length; second += 1) comparisons.push(compareCandidateStructures(candidates[first], first, candidates[second], second))
  return comparisons
}
