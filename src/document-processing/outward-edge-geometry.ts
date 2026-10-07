import type { Point } from './types'

export type OutwardEdgeRay = {
  available: boolean
  start: Point
  end: Point
  direction: Point
  lengthPixels: number
  boundary: 'top' | 'right' | 'bottom' | 'left' | null
  unavailableReason?: 'degenerate-edge' | 'no-outward-intersection' | 'edge-too-close-to-image-boundary'
}

export function constructOutwardEdgeRay(points: Point[], edgeIndex: number, width: number, height: number): OutwardEdgeRay {
  const point = points[edgeIndex]
  const next = points[(edgeIndex + 1) % points.length]
  const start = { x: (point.x + next.x) / 2, y: (point.y + next.y) / 2 }
  const edge = { x: next.x - point.x, y: next.y - point.y }
  const edgeLength = Math.hypot(edge.x, edge.y)
  if (!edgeLength) return { available: false, start, end: start, direction: { x: 0, y: 0 }, lengthPixels: 0, boundary: null, unavailableReason: 'degenerate-edge' }

  const centroid = points.reduce((sum, corner) => ({ x: sum.x + corner.x / points.length, y: sum.y + corner.y / points.length }), { x: 0, y: 0 })
  let direction = { x: -edge.y / edgeLength, y: edge.x / edgeLength }
  const towardInterior = { x: centroid.x - start.x, y: centroid.y - start.y }
  if (direction.x * towardInterior.x + direction.y * towardInterior.y > 0) direction = { x: -direction.x, y: -direction.y }

  const intersections: Array<{ distance: number; boundary: OutwardEdgeRay['boundary'] }> = []
  if (direction.x > 0) intersections.push({ distance: (width - 1 - start.x) / direction.x, boundary: 'right' })
  if (direction.x < 0) intersections.push({ distance: -start.x / direction.x, boundary: 'left' })
  if (direction.y > 0) intersections.push({ distance: (height - 1 - start.y) / direction.y, boundary: 'bottom' })
  if (direction.y < 0) intersections.push({ distance: -start.y / direction.y, boundary: 'top' })
  const intersection = intersections.filter(({ distance }) => Number.isFinite(distance) && distance >= 0).sort((a, b) => a.distance - b.distance)[0]
  if (!intersection) return { available: false, start, end: start, direction, lengthPixels: 0, boundary: null, unavailableReason: 'no-outward-intersection' }

  const end = { x: start.x + direction.x * intersection.distance, y: start.y + direction.y * intersection.distance }
  if (intersection.distance <= 1) return { available: false, start, end, direction, lengthPixels: intersection.distance, boundary: intersection.boundary, unavailableReason: 'edge-too-close-to-image-boundary' }
  return { available: true, start, end, direction, lengthPixels: intersection.distance, boundary: intersection.boundary }
}
