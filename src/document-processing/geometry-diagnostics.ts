import type { Point } from './types'

const labels = ['TL', 'TR', 'BR', 'BL'] as const

function cross(a: Point, b: Point, c: Point) {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)
}

function intersects(a: Point, b: Point, c: Point, d: Point) {
  const abC = cross(a, b, c); const abD = cross(a, b, d)
  const cdA = cross(c, d, a); const cdB = cross(c, d, b)
  return abC * abD < 0 && cdA * cdB < 0
}

export function describeGeometry(points: Point[]) {
  const signs = points.length === 4 ? points.map((point, index) => Math.sign(cross(point, points[(index + 1) % 4], points[(index + 2) % 4]))).filter(Boolean) : []
  const edgeIntersections = points.length === 4 ? [
    { edges: ['TL-TR', 'BR-BL'], intersects: intersects(points[0], points[1], points[2], points[3]) },
    { edges: ['TR-BR', 'BL-TL'], intersects: intersects(points[1], points[2], points[3], points[0]) },
  ] : []
  return {
    corners: points.map((point, index) => ({ label: labels[index] ?? `corner-${index + 1}`, x: point.x, y: point.y })),
    convex: signs.length === 4 && signs.every((sign) => sign === signs[0]),
    edgeIntersections,
    selfIntersecting: edgeIntersections.some((entry) => entry.intersects),
  }
}

export function describeGeometryTransition(from: Point[], to: Point[]) {
  const mapping = from.map((point, fromIndex) => {
    let best = -1; let bestDistance = Number.POSITIVE_INFINITY
    to.forEach((candidate, index) => {
      const distance = Math.hypot(point.x - candidate.x, point.y - candidate.y)
      if (distance < bestDistance) { best = index; bestDistance = distance }
    })
    return { from: labels[fromIndex] ?? `corner-${fromIndex + 1}`, to: labels[best] ?? `corner-${best + 1}`, distance: bestDistance }
  })
  const fromGeometry = describeGeometry(from)
  const toGeometry = describeGeometry(to)
  return {
    mapping,
    cornerOrderChanged: mapping.some((entry, index) => entry.distance <= 1e-6 && entry.to !== labels[index]),
    coordinatesChanged: mapping.some((entry) => entry.distance > 1e-6),
    becameNonConvex: fromGeometry.convex && !toGeometry.convex,
    becameSelfIntersecting: !fromGeometry.selfIntersecting && toGeometry.selfIntersecting,
  }
}
