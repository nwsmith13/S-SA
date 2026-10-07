import type { DetectionResult, Point, ProcessedPage, ProcessingMode } from './types'
import { emitDiagnostic, serializeDiagnosticError } from './diagnostics'
import { getOpenCv, getOpenCvInitializationMs, type CvRuntime } from './opencv-loader'
import { classifyContourArea, findIndependentAgreement, selectCandidateByQuality, shouldAutoApplyCandidate, type CandidateAgreement, type CandidateQualityAssessment } from './candidate-quality'
import { describeGeometry, describeGeometryTransition } from './geometry-diagnostics'

type Cv = CvRuntime
export type DetectionDiagnosticContext = { pageId: string; documentId?: string; pageIndex: number; pageNumber: number }
type LoadedImage = { source: CanvasImageSource; width: number; height: number; decodeMethod: 'image-bitmap' | 'html-image'; release: () => void }
type Candidate = { points: Point[]; detectorPoints: Point[]; confidence: number; method: DetectionResult['method'] }
type SmallContourEvaluation = { contourIndex: number; areaRatio: number; exactCandidate: boolean; hullCandidate: boolean }
type StageStats = { contours: number; eligibleContours: number; smallContoursAdmitted: number; smallContourEvaluations: SmallContourEvaluation[]; exactCandidates: number; hullCandidates: number; maxAreaRatio: number; above2Percent: number; above4Percent: number; above6Percent: number; rejectedBelow4Percent: number; rejectedBelow8Percent: number }
type DetectionDiagnostics = {
  identity: DetectionDiagnosticContext
  file: { name: string; type: string; bytes: number; lastModified: number }
  decode?: { method: LoadedImage['decodeMethod']; width: number; height: number }
  workingDimensions?: string
  canny?: { median: number; low: number; high: number; otsu: number }
  stages: { light: StageStats; edge: StageStats; lines: { count: number; candidate: boolean } }
  rejections: Record<string, number>
  candidates: Array<{ method: Candidate['method']; score: number; areaRatio: number; corners: number[][]; accepted: boolean; rejectionReasons: string[]; boundaryFollowingEdges: CandidateQualityAssessment['boundaryFollowingEdges']; requiresIndependentAgreement: boolean; agreement: CandidateAgreement; contextMeasurements?: ReturnType<typeof measureCandidateContext> }>
  selected: number | null
  candidateQuality?: CandidateQualityAssessment
  fallback?: 'manual-adjust-edges'
  selectionDecision?: { highestScoreIndex: number | null; selectedIndex: number | null; rejectedHigherCandidates: number; behavior: 'auto-apply' | 'manual-adjust-edges' }
  methodAgreement?: CandidateAgreement
  confidenceDecision?: { originalScore: number; returnedConfidence: number; requiresIndependentAgreement: boolean; independentCandidateFound: boolean; corroborated: boolean; materialConflict: boolean; reason: 'geometry-and-confidence' | 'independent-method-agreement' | 'independent-method-conflict' | 'required-agreement-missing' | 'candidate-quality-rejected'; behavior: 'auto-apply' | 'manual-adjust-edges' }
  result?: { state: 'auto-apply' | 'manual-adjust-edges' | 'full-image-fallback'; editorCorners: Point[] | null; cornerSource: 'candidate' | 'full-image' | 'not-required'; selectedCandidateMethod: Candidate['method'] | null; selectedCandidateIndex: number | null; candidateConfidence: number; agreement: CandidateAgreement | null; geometryTrace?: { detectorCandidate: ReturnType<typeof describeGeometry>; orderedCandidate: ReturnType<typeof describeGeometry>; transition: ReturnType<typeof describeGeometryTransition> } }
}

class ProcessingPipelineError extends Error {
  constructor(public stage: string, error: unknown) {
    super(error instanceof Error ? error.message : String(error), { cause: error })
    this.name = 'ProcessingPipelineError'
  }
}

function incrementReason(diagnostics: DetectionDiagnostics, reason: string) {
  diagnostics.rejections[reason] = (diagnostics.rejections[reason] ?? 0) + 1
}

async function loadImage(file: File): Promise<LoadedImage> {
  const userAgent = typeof navigator === 'undefined' ? '' : navigator.userAgent
  const safari = /AppleWebKit/i.test(userAgent) && !/(CriOS|FxiOS|EdgiOS|Chrome|Chromium)/i.test(userAgent)
  if (!safari && typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
      return { source: bitmap, width: bitmap.width, height: bitmap.height, decodeMethod: 'image-bitmap', release: () => bitmap.close() }
    } catch (error) {
      emitDiagnostic('[S&SA decode fallback]', { from: 'createImageBitmap', to: 'html-image', error: serializeDiagnosticError(error) }, 'warn')
      // Safari and HEIC implementations can expose createImageBitmap but still reject a decodable file.
    }
  }

  const url = URL.createObjectURL(file)
  const image = new Image()
  image.decoding = 'async'
  try {
    if (typeof image.decode === 'function') {
      image.src = url
      try {
        await image.decode()
      } catch (error) {
        if (!image.complete || !image.naturalWidth) throw error
        emitDiagnostic('[S&SA decode fallback]', { from: 'html-image.decode', to: 'html-image.complete', error: serializeDiagnosticError(error) }, 'warn')
      }
    } else {
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve()
        image.onerror = () => reject(new Error('The browser could not decode the original image'))
        image.src = url
      })
    }
    return { source: image, width: image.naturalWidth, height: image.naturalHeight, decodeMethod: 'html-image', release: () => URL.revokeObjectURL(url) }
  } catch (error) {
    URL.revokeObjectURL(url)
    throw error
  }
}

function drawImage(image: LoadedImage, maxDimension: number) {
  const scale = Math.min(1, maxDimension / Math.max(image.width, image.height))
  const width = Math.max(1, Math.round(image.width * scale))
  const height = Math.max(1, Math.round(image.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  if (canvas.width !== width || canvas.height !== height || width <= 0 || height <= 0) throw new Error(`Canvas allocation failed for ${width}x${height}`)
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('Canvas is unavailable')
  context.drawImage(image.source, 0, 0, width, height)
  return { canvas, context, width, height }
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Could not create the processed image')), type, quality))
}

function orderCorners(points: Point[]): Point[] {
  const center = points.reduce((value, point) => ({ x: value.x + point.x / points.length, y: value.y + point.y / points.length }), { x: 0, y: 0 })
  const ordered = [...points].sort((a, b) => Math.atan2(a.y - center.y, a.x - center.x) - Math.atan2(b.y - center.y, b.x - center.x))
  const first = ordered.reduce((best, point, index) => point.x + point.y < ordered[best].x + ordered[best].y ? index : best, 0)
  return [...ordered.slice(first), ...ordered.slice(0, first)]
}

function distance(a: Point, b: Point) { return Math.hypot(a.x - b.x, a.y - b.y) }

function polygonArea(points: Point[]) {
  return Math.abs(points.reduce((area, point, index) => {
    const next = points[(index + 1) % points.length]
    return area + point.x * next.y - next.x * point.y
  }, 0) / 2)
}

function pointInPolygon(point: Point, polygon: Point[]) {
  let inside = false
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const a = polygon[index]; const b = polygon[previous]
    if ((a.y > point.y) !== (b.y > point.y) && point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) inside = !inside
  }
  return inside
}

function outwardEdgeEvidence(edgeMask: any, points: Point[]) {
  const centroid = points.reduce((sum, point) => ({ x: sum.x + point.x / 4, y: sum.y + point.y / 4 }), { x: 0, y: 0 })
  const edgeLabels = ['top', 'right', 'bottom', 'left']
  return points.map((point, index) => {
    const next = points[(index + 1) % 4]
    const midpoint = { x: (point.x + next.x) / 2, y: (point.y + next.y) / 2 }
    const vector = { x: midpoint.x - centroid.x, y: midpoint.y - centroid.y }
    const limits = [
      vector.x > 0 ? (edgeMask.cols - 1 - midpoint.x) / vector.x : vector.x < 0 ? -midpoint.x / vector.x : Number.POSITIVE_INFINITY,
      vector.y > 0 ? (edgeMask.rows - 1 - midpoint.y) / vector.y : vector.y < 0 ? -midpoint.y / vector.y : Number.POSITIVE_INFINITY,
    ].filter((value) => value > 0 && Number.isFinite(value))
    const limit = Math.min(...limits)
    if (!Number.isFinite(limit) || limit <= 1) return { edge: edgeLabels[index], strongEvidenceContinuesOutward: false, evidenceRatio: 0 }
    let hits = 0; const samples = 32
    for (let sample = 1; sample <= samples; sample += 1) {
      const scale = 1 + (limit - 1) * sample / samples
      const x = Math.max(0, Math.min(edgeMask.cols - 1, Math.round(centroid.x + vector.x * scale)))
      const y = Math.max(0, Math.min(edgeMask.rows - 1, Math.round(centroid.y + vector.y * scale)))
      let hit = false
      for (let offsetY = -1; offsetY <= 1 && !hit; offsetY += 1) for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
        const px = Math.max(0, Math.min(edgeMask.cols - 1, x + offsetX)); const py = Math.max(0, Math.min(edgeMask.rows - 1, y + offsetY))
        if (edgeMask.ucharPtr(py, px)[0] > 0) { hit = true; break }
      }
      if (hit) hits += 1
    }
    const evidenceRatio = hits / samples
    return { edge: edgeLabels[index], strongEvidenceContinuesOutward: evidenceRatio >= .08, evidenceRatio }
  })
}

function measureCandidateContext(index: number, candidates: Candidate[], normalizedCandidates: Point[][], assessments: CandidateQualityAssessment[], edgeMask: any, width: number, height: number) {
  const points = normalizedCandidates[index]
  const xs = points.map((point) => point.x); const ys = points.map((point) => point.y)
  const areaRatio = polygonArea(points)
  const enclosingCandidate = normalizedCandidates.map((candidate, candidateIndex) => ({ candidate, candidateIndex }))
    .filter(({ candidate, candidateIndex }) => candidateIndex !== index && assessments[candidateIndex].accepted && polygonArea(candidate) > areaRatio * 1.08 && points.every((point) => pointInPolygon(point, candidate)))
    .sort((a, b) => polygonArea(a.candidate) - polygonArea(b.candidate))[0]
  return {
    boundingBox: { widthRatio: Math.max(...xs) - Math.min(...xs), heightRatio: Math.max(...ys) - Math.min(...ys) },
    centroid: points.reduce((sum, point) => ({ x: sum.x + point.x / 4, y: sum.y + point.y / 4 }), { x: 0, y: 0 }),
    edgeDistanceFromImageBoundary: {
      top: (points[0].y + points[1].y) / 2, right: 1 - (points[1].x + points[2].x) / 2,
      bottom: 1 - (points[2].y + points[3].y) / 2, left: (points[3].x + points[0].x) / 2,
    },
    imageAreaOutsideCandidatePercent: (1 - areaRatio) * 100,
    outwardEdgeEvidence: outwardEdgeEvidence(edgeMask, candidates[index].points),
    enclosingLargerPlausibleCandidate: enclosingCandidate ? {
      index: enclosingCandidate.candidateIndex, method: candidates[enclosingCandidate.candidateIndex].method,
      score: candidates[enclosingCandidate.candidateIndex].confidence, areaRatio: polygonArea(enclosingCandidate.candidate),
    } : null,
  }
}

function isFullImageBoundary(points: Point[], width: number, height: number) {
  const normalized = points.map((point) => ({ x: point.x / width, y: point.y / height }))
  const areaRatio = polygonArea(points) / (width * height)
  const nearBorder = normalized.filter((point) => Math.min(point.x, point.y, 1 - point.x, 1 - point.y) < .025).length
  const bounds = {
    left: Math.min(...normalized.map((point) => point.x)), right: Math.max(...normalized.map((point) => point.x)),
    top: Math.min(...normalized.map((point) => point.y)), bottom: Math.max(...normalized.map((point) => point.y)),
  }
  return areaRatio > .92 || nearBorder === 4 || (bounds.left < .015 && bounds.top < .015 && bounds.right > .985 && bounds.bottom > .985)
}

function scoreCandidate(points: Point[], width: number, height: number, contourArea: number, method: Candidate['method'], diagnostics: DetectionDiagnostics, allowSmallDocument = false): Candidate | null {
  if (points.length !== 4) { incrementReason(diagnostics, 'not-four-corners'); return null }
  const ordered = orderCorners(points)
  if (isFullImageBoundary(ordered, width, height)) { incrementReason(diagnostics, 'full-image-boundary'); return null }
  const areaRatio = polygonArea(ordered) / (width * height)
  if (areaRatio < (allowSmallDocument ? .035 : .10)) { incrementReason(diagnostics, 'candidate-too-small'); return null }
  if (areaRatio > .9) { incrementReason(diagnostics, 'candidate-too-large'); return null }
  if (ordered.some((point) => point.x < -width * .03 || point.y < -height * .03 || point.x > width * 1.03 || point.y > height * 1.03)) { incrementReason(diagnostics, 'corner-outside-image'); return null }

  const edgeLengths = ordered.map((point, index) => distance(point, ordered[(index + 1) % 4]))
  const edgeBalance = Math.min(...edgeLengths) / Math.max(...edgeLengths)
  const rectangularFill = Math.min(1, contourArea / Math.max(1, polygonArea(ordered)))
  const areaScore = 1 - Math.min(1, Math.abs(areaRatio - .52) / .52)
  const normalized = ordered.map((point) => ({ x: point.x / width, y: point.y / height }))
  if (allowSmallDocument) {
    const quality = selectCandidateByQuality([{ points: normalized, score: 0 }]).assessments[0]
    if (!quality.accepted) {
      quality.reasons.forEach((reason) => incrementReason(diagnostics, `${method}:small-document:${reason}`))
      return null
    }
  }
  const inset = Math.min(...normalized.flatMap((point) => [point.x, point.y, 1 - point.x, 1 - point.y]))
  const methodWeight = method === 'light-contour' ? .1 : method === 'edge-contour' ? .06 : 0
  const confidence = Math.max(.2, Math.min(.97, .32 + areaScore * .23 + edgeBalance * .17 + rectangularFill * .16 + Math.min(.08, Math.max(0, inset)) + methodWeight))
  return { points: ordered, detectorPoints: points.map((point) => ({ ...point })), confidence, method }
}

function matPoints(mat: any): Point[] {
  const points: Point[] = []
  for (let row = 0; row < mat.rows; row += 1) points.push({ x: mat.intPtr(row, 0)[0], y: mat.intPtr(row, 0)[1] })
  return points
}

function extremeQuad(points: Point[]): Point[] | null {
  if (points.length < 4) return null
  const bySum = [...points].sort((a, b) => a.x + a.y - b.x - b.y)
  const byDiff = [...points].sort((a, b) => a.y - a.x - (b.y - b.x))
  const quad = [bySum[0], byDiff[0], bySum.at(-1)!, byDiff.at(-1)!]
  if (new Set(quad.map((point) => `${point.x},${point.y}`)).size !== 4) return null
  return orderCorners(quad)
}

function candidatesFromMask(cv: Cv, mask: any, width: number, height: number, method: 'light-contour' | 'edge-contour', diagnostics: DetectionDiagnostics, stats: StageStats) {
  const candidates: Candidate[] = []
  const contours = new cv.MatVector()
  const hierarchy = new cv.Mat()
  const working = mask.clone()
  try {
    cv.findContours(working, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE)
    stats.contours = contours.size()
    for (let index = 0; index < contours.size(); index += 1) {
      const contour = contours.get(index)
      const perimeter = cv.arcLength(contour, true)
      const contourArea = Math.abs(cv.contourArea(contour))
      const areaRatio = contourArea / (width * height)
      stats.maxAreaRatio = Math.max(stats.maxAreaRatio, areaRatio)
      if (areaRatio >= .02) stats.above2Percent += 1
      if (areaRatio >= .04) stats.above4Percent += 1
      if (areaRatio >= .06) stats.above6Percent += 1
      const contourEligibility = classifyContourArea(areaRatio)
      const smallDocumentContour = contourEligibility === 'small-document'
      if (contourEligibility === 'reject') { stats.rejectedBelow4Percent += 1; stats.rejectedBelow8Percent += 1; incrementReason(diagnostics, `${method}:contour-too-small`); contour.delete(); continue }
      if (smallDocumentContour) stats.smallContoursAdmitted += 1
      stats.eligibleContours += 1
      let exactFound = false
      const smallEvaluation = smallDocumentContour ? { contourIndex: index, areaRatio, exactCandidate: false, hullCandidate: false } : undefined
      try {
        for (const epsilon of [.012, .02, .032, .05, .075]) {
          const approx = new cv.Mat()
          try {
            cv.approxPolyDP(contour, approx, perimeter * epsilon, true)
            if (approx.rows !== 4 || !cv.isContourConvex(approx)) continue
            const candidate = scoreCandidate(matPoints(approx), width, height, contourArea, method, diagnostics, smallDocumentContour)
            if (candidate) { candidates.push(candidate); stats.exactCandidates += 1; exactFound = true; if (smallEvaluation) smallEvaluation.exactCandidate = true; break }
          } finally { approx.delete() }
        }

        if (!exactFound) {
          const hull = new cv.Mat()
          try {
            cv.convexHull(contour, hull, false, true)
            const quad = extremeQuad(matPoints(hull))
            if (!quad) incrementReason(diagnostics, `${method}:hull-had-no-quad`)
            const candidate = quad ? scoreCandidate(quad, width, height, contourArea, 'edge-hull', diagnostics, smallDocumentContour) : null
            if (candidate) { candidates.push({ ...candidate, confidence: Math.min(candidate.confidence, .68) }); stats.hullCandidates += 1; if (smallEvaluation) smallEvaluation.hullCandidate = true }
          } finally { hull.delete() }
        }
      } finally {
        if (smallEvaluation) stats.smallContourEvaluations.push(smallEvaluation)
        contour.delete()
      }
    }
  } finally { working.delete(); contours.delete(); hierarchy.delete() }
  return candidates
}

function candidateFromLines(cv: Cv, edges: any, width: number, height: number, diagnostics: DetectionDiagnostics): Candidate | null {
  const lines = new cv.Mat()
  try {
    cv.HoughLinesP(edges, lines, 1, Math.PI / 180, 45, Math.min(width, height) * .2, Math.min(width, height) * .055)
    const endpoints: Point[] = []
    for (let row = 0; row < lines.rows; row += 1) {
      const line = lines.intPtr(row, 0)
      endpoints.push({ x: line[0], y: line[1] }, { x: line[2], y: line[3] })
    }
    diagnostics.stages.lines.count = lines.rows
    const quad = extremeQuad(endpoints)
    if (!quad) incrementReason(diagnostics, 'lines:no-four-corner-candidate')
    const candidate = quad ? scoreCandidate(quad, width, height, polygonArea(quad), 'edge-hull', diagnostics) : null
    diagnostics.stages.lines.candidate = Boolean(candidate)
    return candidate
  } finally { lines.delete() }
}

function grayMedian(gray: any) {
  const samples: number[] = []
  const step = Math.max(1, Math.floor(gray.data.length / 12000))
  for (let index = 0; index < gray.data.length; index += step) samples.push(gray.data[index])
  samples.sort((a, b) => a - b)
  return samples[Math.floor(samples.length / 2)] ?? 100
}

export async function detectDocument(file: File, identity: DetectionDiagnosticContext): Promise<DetectionResult> {
  const totalStarted = performance.now()
  const diagnostics: DetectionDiagnostics = {
    identity,
    file: { name: file.name, type: file.type, bytes: file.size, lastModified: file.lastModified },
    stages: {
      light: { contours: 0, eligibleContours: 0, smallContoursAdmitted: 0, smallContourEvaluations: [], exactCandidates: 0, hullCandidates: 0, maxAreaRatio: 0, above2Percent: 0, above4Percent: 0, above6Percent: 0, rejectedBelow4Percent: 0, rejectedBelow8Percent: 0 },
      edge: { contours: 0, eligibleContours: 0, smallContoursAdmitted: 0, smallContourEvaluations: [], exactCandidates: 0, hullCandidates: 0, maxAreaRatio: 0, above2Percent: 0, above4Percent: 0, above6Percent: 0, rejectedBelow4Percent: 0, rejectedBelow8Percent: 0 },
      lines: { count: 0, candidate: false },
    },
    rejections: {}, candidates: [], selected: null,
  }
  let failureStage = 'opencv-initialization'
  let image: LoadedImage | null = null
  let source: any = null
  let gray: any = null
  let blurred: any = null
  let edges: any = null
  let edgeClosed: any = null
  let lightMask: any = null
  let lightClosed: any = null
  let kernel3: any = null

  try {
    const cvWaitStarted = performance.now()
    const { cv } = await getOpenCv()
    const opencvInitMs = getOpenCvInitializationMs() || performance.now() - cvWaitStarted
    failureStage = 'original-image-decode'
    const decodeStarted = performance.now()
    image = await loadImage(file)
    diagnostics.decode = { method: image.decodeMethod, width: image.width, height: image.height }
    failureStage = 'detection-canvas-draw'
    const { context, width, height } = drawImage(image, 1600)
    image.release(); image = null
    diagnostics.workingDimensions = `${width}x${height}`
    const imageDecodeMs = performance.now() - decodeStarted
    const detectionStarted = performance.now()
    failureStage = 'opencv-source-creation'
    source = cv.matFromImageData(context.getImageData(0, 0, width, height))
    gray = new cv.Mat(); blurred = new cv.Mat(); edges = new cv.Mat(); edgeClosed = new cv.Mat()
    lightMask = new cv.Mat(); lightClosed = new cv.Mat(); kernel3 = cv.Mat.ones(3, 3, cv.CV_8U)
    failureStage = 'candidate-generation'
    cv.cvtColor(source, gray, cv.COLOR_RGBA2GRAY)
    cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0)
    const median = grayMedian(blurred)
    const low = Math.max(18, Math.min(90, median * .48))
    const high = Math.max(low + 35, Math.min(190, median * 1.25))
    cv.Canny(blurred, edges, low, high)
    cv.morphologyEx(edges, edgeClosed, cv.MORPH_CLOSE, kernel3)

    const otsu = cv.threshold(blurred, lightMask, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU)
    cv.morphologyEx(lightMask, lightClosed, cv.MORPH_CLOSE, kernel3)
    diagnostics.canny = { median, low, high, otsu: typeof otsu === 'number' ? otsu : -1 }

    const candidates = [
      ...candidatesFromMask(cv, lightClosed, width, height, 'light-contour', diagnostics, diagnostics.stages.light),
      ...candidatesFromMask(cv, edgeClosed, width, height, 'edge-contour', diagnostics, diagnostics.stages.edge),
    ]
    const lineCandidate = candidateFromLines(cv, edgeClosed, width, height, diagnostics)
    if (lineCandidate) candidates.push(lineCandidate)
    candidates.sort((a, b) => b.confidence - a.confidence)
    const normalizedCandidates = candidates.map((candidate) => candidate.points.map((point) => ({ x: point.x / width, y: point.y / height })))
    const qualitySelection = selectCandidateByQuality(candidates.map((candidate, index) => ({ points: normalizedCandidates[index], score: candidate.confidence })))
    const agreementInputs = candidates.map((candidate, index) => ({ points: normalizedCandidates[index], method: candidate.method, score: candidate.confidence, viable: qualitySelection.assessments[index].accepted && candidate.confidence >= .5 }))
    const agreements = candidates.map((_candidate, index) => findIndependentAgreement(index, agreementInputs))
    const autoApplyIndex = qualitySelection.assessments.findIndex((assessment, index) => shouldAutoApplyCandidate(assessment, agreements[index]))
    const acceptedIndex = qualitySelection.selectedIndex
    const bestIndex = autoApplyIndex >= 0 ? autoApplyIndex : acceptedIndex >= 0 ? acceptedIndex : candidates.length ? 0 : -1
    const best = bestIndex >= 0 ? candidates[bestIndex] : undefined
    const normalizedBest = bestIndex >= 0 ? normalizedCandidates[bestIndex] : undefined
    const candidateQuality = bestIndex >= 0 ? qualitySelection.assessments[bestIndex] : undefined
    const methodAgreement = bestIndex >= 0 ? agreements[bestIndex] : { corroborated: false, independentCandidateFound: false, materialConflict: false }
    const autoApply = autoApplyIndex >= 0
    diagnostics.candidates = candidates.slice(0, 12).map((candidate, index) => ({
      method: candidate.method,
      score: Math.round(candidate.confidence * 1000) / 1000,
      areaRatio: Math.round(polygonArea(candidate.points) / (width * height) * 1000) / 1000,
      corners: candidate.points.map((point) => [Math.round(point.x / width * 1000) / 1000, Math.round(point.y / height * 1000) / 1000]),
      accepted: qualitySelection.assessments[index].accepted,
      rejectionReasons: qualitySelection.assessments[index].reasons,
      boundaryFollowingEdges: qualitySelection.assessments[index].boundaryFollowingEdges,
      requiresIndependentAgreement: qualitySelection.assessments[index].requiresIndependentAgreement,
      agreement: agreements[index],
      contextMeasurements: qualitySelection.assessments[index].accepted
        ? measureCandidateContext(index, candidates, normalizedCandidates, qualitySelection.assessments, edgeClosed, width, height)
        : undefined,
    }))
    diagnostics.candidateQuality = candidateQuality
    diagnostics.methodAgreement = methodAgreement
    diagnostics.selected = autoApply ? bestIndex : null
    diagnostics.selectionDecision = { highestScoreIndex: candidates.length ? 0 : null, selectedIndex: autoApply ? bestIndex : null, rejectedHigherCandidates: autoApply ? bestIndex : candidates.length, behavior: autoApply ? 'auto-apply' : 'manual-adjust-edges' }
    const returnedConfidence = best ? autoApply ? best.confidence : Math.min(.49, best.confidence) : 0
    if (best && candidateQuality) {
      const reason = !candidateQuality.accepted ? 'candidate-quality-rejected'
        : methodAgreement.materialConflict ? 'independent-method-conflict'
          : candidateQuality.requiresIndependentAgreement && !methodAgreement.corroborated ? 'required-agreement-missing'
            : methodAgreement.corroborated ? 'independent-method-agreement' : 'geometry-and-confidence'
      diagnostics.confidenceDecision = { originalScore: best.confidence, returnedConfidence, requiresIndependentAgreement: candidateQuality.requiresIndependentAgreement, independentCandidateFound: methodAgreement.independentCandidateFound, corroborated: methodAgreement.corroborated, materialConflict: methodAgreement.materialConflict, reason, behavior: autoApply ? 'auto-apply' : 'manual-adjust-edges' }
    }
    if (best && !autoApply) diagnostics.fallback = 'manual-adjust-edges'
    const fullImage = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }]
    const detectorBest = bestIndex >= 0 ? best!.detectorPoints.map((point) => ({ x: point.x / width, y: point.y / height })) : undefined
    const geometryTransition = detectorBest && normalizedBest ? describeGeometryTransition(detectorBest, normalizedBest) : undefined
    if (!autoApply && geometryTransition && (geometryTransition.cornerOrderChanged || geometryTransition.becameNonConvex || geometryTransition.becameSelfIntersecting)) {
      emitDiagnostic('[S&SA GEOMETRY WARNING]', { ...identity, transition: 'detector-candidate-to-ordered-candidate', analysis: geometryTransition, from: describeGeometry(detectorBest!), to: describeGeometry(normalizedBest!) }, 'error')
    }
    diagnostics.result = best ? {
      state: autoApply ? 'auto-apply' : 'manual-adjust-edges',
      editorCorners: autoApply ? null : normalizedBest!,
      cornerSource: autoApply ? 'not-required' : 'candidate',
      selectedCandidateMethod: best.method,
      selectedCandidateIndex: bestIndex,
      candidateConfidence: best.confidence,
      agreement: methodAgreement,
      geometryTrace: detectorBest && normalizedBest && geometryTransition ? {
        detectorCandidate: describeGeometry(detectorBest), orderedCandidate: describeGeometry(normalizedBest), transition: geometryTransition,
      } : undefined,
    } : {
      state: 'full-image-fallback', editorCorners: fullImage, cornerSource: 'full-image', selectedCandidateMethod: null,
      selectedCandidateIndex: null, candidateConfidence: 0, agreement: null,
    }
    const detectionMs = performance.now() - detectionStarted
    const timing = { opencvInitMs, imageDecodeMs, detectionMs, totalMs: performance.now() - totalStarted }
    emitDiagnostic('[S&SA detection diagnostics]', diagnostics)
    emitDiagnostic('[S&SA scan timing]', { stage: 'detect', method: best?.method ?? 'none', dimensions: `${width}x${height}`, ...timing })
    if (!best) throw new Error('No reasonable paper candidate found')
    return { corners: normalizedBest!, confidence: returnedConfidence, sourceWidth: width, sourceHeight: height, method: best.method, timing, detectorCorners: detectorBest!, orderedCorners: normalizedBest! }
  } catch (error) {
    diagnostics.result ??= {
      state: 'full-image-fallback', editorCorners: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }], cornerSource: 'full-image',
      selectedCandidateMethod: null, selectedCandidateIndex: null, candidateConfidence: 0, agreement: null,
    }
    emitDiagnostic('[S&SA detection failure]', { stage: failureStage, error: serializeDiagnosticError(error), diagnostics }, 'error')
    throw error
  } finally {
    image?.release()
    source?.delete(); gray?.delete(); blurred?.delete(); edges?.delete(); edgeClosed?.delete(); lightMask?.delete(); lightClosed?.delete(); kernel3?.delete()
  }
}

function applyEnhancement(cv: Cv, source: any, mode: ProcessingMode) {
  if (mode === 'black-white') {
    const gray = new cv.Mat(); const output = new cv.Mat()
    cv.cvtColor(source, gray, cv.COLOR_RGBA2GRAY)
    cv.adaptiveThreshold(gray, output, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY, 35, 11)
    gray.delete(); return output
  }
  if (mode === 'grayscale') {
    const gray = new cv.Mat(); const output = new cv.Mat()
    cv.cvtColor(source, gray, cv.COLOR_RGBA2GRAY); cv.convertScaleAbs(gray, output, 1.08, -5)
    gray.delete(); return output
  }
  const output = new cv.Mat()
  cv.convertScaleAbs(source, output, mode === 'color' ? 1.08 : 1.04, mode === 'color' ? -4 : -2)
  return output
}

export async function processDocument(file: File, corners: Point[], mode: ProcessingMode, rotation: number): Promise<ProcessedPage> {
  const started = performance.now()
  const timings: Record<string, number> = {}
  let stage = 'opencv-initialization'
  let cv: Cv | null = null
  let image: LoadedImage | null = null
  let source: any = null
  let warped: any = null
  let sourcePoints: any = null
  let targetPoints: any = null
  let transform: any = null
  let enhanced: any = null
  let rotated: any = null
  let outputMat: any = null
  const checkpoint = (operation: string, phase: 'before' | 'after', details: Record<string, unknown> = {}) => {
    emitDiagnostic('[S&SA processing checkpoint]', { operation, phase, mode, rotation, normalizedCorners: corners, ...details })
  }
  try {
    let stageStarted = performance.now()
    checkpoint('opencv-initialization', 'before')
    ;({ cv } = await getOpenCv())
    timings[stage] = performance.now() - stageStarted
    checkpoint('opencv-initialization', 'after', { elapsedMs: timings[stage] })

    stage = 'original-image-decode'; stageStarted = performance.now()
    checkpoint(stage, 'before', { file: { type: file.type, bytes: file.size } })
    image = await loadImage(file)
    const decodeMethod = image.decodeMethod
    const originalDimensions = `${image.width}x${image.height}`
    timings[stage] = performance.now() - stageStarted
    checkpoint(stage, 'after', { decodeMethod, originalDimensions, elapsedMs: timings[stage] })

    stage = 'canvas-creation-draw'; stageStarted = performance.now()
    checkpoint('canvas-creation-draw', 'before', { decodeMethod, originalDimensions, maximumDimension: 2200 })
    const { context, width, height } = drawImage(image, 2200)
    checkpoint('canvas-creation-draw', 'after', { workingDimensions: `${width}x${height}` })
    image.release(); image = null
    stage = 'canvas-image-data-read'; checkpoint(stage, 'before', { workingDimensions: `${width}x${height}` })
    const imageData = context.getImageData(0, 0, width, height)
    checkpoint(stage, 'after', { imageDataDimensions: `${imageData.width}x${imageData.height}` })
    stage = 'canvas-creation-draw'
    timings[stage] = performance.now() - stageStarted

    if (corners.length !== 4 || corners.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.y))) throw new Error(`Invalid normalized corners: ${JSON.stringify(corners)}`)
    const ordered = orderCorners(corners.map((point) => ({
      x: Math.max(0, Math.min(width - 1, point.x * (width - 1))),
      y: Math.max(0, Math.min(height - 1, point.y * (height - 1))),
    })))
    const [topLeft, topRight, bottomRight, bottomLeft] = ordered
    const outputWidth = Math.max(64, Math.min(2200, Math.round(Math.max(distance(topLeft, topRight), distance(bottomLeft, bottomRight)))))
    const outputHeight = Math.max(64, Math.min(2200, Math.round(Math.max(distance(topLeft, bottomLeft), distance(topRight, bottomRight)))))
    if (polygonArea(ordered) < width * height * .005) throw new Error(`Selected corners produce an unusably small page: ${JSON.stringify(ordered)}`)

    stage = 'opencv-source-creation'; stageStarted = performance.now()
    checkpoint(stage, 'before', { imageDataDimensions: `${imageData.width}x${imageData.height}` })
    source = cv.matFromImageData(imageData)
    if (!source || source.empty()) throw new Error(`OpenCV source Mat is empty for ${width}x${height}`)
    timings[stage] = performance.now() - stageStarted
    checkpoint(stage, 'after', { sourceDimensions: `${source.cols}x${source.rows}`, elapsedMs: timings[stage] })

    stage = 'perspective-output-allocation'; stageStarted = performance.now()
    checkpoint(stage, 'before', { outputDimensions: `${outputWidth}x${outputHeight}` })
    warped = new cv.Mat()
    checkpoint(stage, 'after')
    stage = 'perspective-source-points'; checkpoint(stage, 'before', { pixelCorners: ordered })
    sourcePoints = cv.matFromArray(4, 1, cv.CV_32FC2, ordered.flatMap((point) => [point.x, point.y]))
    checkpoint(stage, 'after', { rows: sourcePoints.rows, columns: sourcePoints.cols })
    stage = 'perspective-target-points'; checkpoint(stage, 'before', { outputDimensions: `${outputWidth}x${outputHeight}` })
    targetPoints = cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, outputWidth - 1, 0, outputWidth - 1, outputHeight - 1, 0, outputHeight - 1])
    checkpoint(stage, 'after', { rows: targetPoints.rows, columns: targetPoints.cols })
    stage = 'perspective-matrix'; checkpoint(stage, 'before')
    transform = cv.getPerspectiveTransform(sourcePoints, targetPoints)
    if (!transform || transform.empty()) throw new Error('OpenCV returned an empty perspective transform')
    checkpoint(stage, 'after', { rows: transform.rows, columns: transform.cols })
    stage = 'perspective-warp'; checkpoint(stage, 'before', { sourceDimensions: `${source.cols}x${source.rows}`, outputDimensions: `${outputWidth}x${outputHeight}` })
    cv.warpPerspective(source, warped, transform, new cv.Size(outputWidth, outputHeight), cv.INTER_LINEAR, cv.BORDER_REPLICATE)
    if (warped.empty()) throw new Error(`Perspective output is empty for ${outputWidth}x${outputHeight}`)
    checkpoint(stage, 'after', { warpedDimensions: `${warped.cols}x${warped.rows}` })
    source.delete(); source = null
    sourcePoints.delete(); sourcePoints = null
    targetPoints.delete(); targetPoints = null
    transform.delete(); transform = null
    timings['perspective-transform'] = performance.now() - stageStarted

    stage = 'image-enhancement'; stageStarted = performance.now()
    checkpoint(stage, 'before', { warpedDimensions: `${warped.cols}x${warped.rows}` })
    enhanced = applyEnhancement(cv, warped, mode)
    warped.delete(); warped = null
    if (rotation === 90 || rotation === 180 || rotation === 270) {
      rotated = new cv.Mat()
      if (rotation === 90) cv.rotate(enhanced, rotated, cv.ROTATE_90_CLOCKWISE)
      else if (rotation === 180) cv.rotate(enhanced, rotated, cv.ROTATE_180)
      else cv.rotate(enhanced, rotated, cv.ROTATE_90_COUNTERCLOCKWISE)
      enhanced.delete(); enhanced = null
      outputMat = rotated
    } else outputMat = enhanced
    timings[stage] = performance.now() - stageStarted
    checkpoint(stage, 'after', { outputDimensions: `${outputMat.cols}x${outputMat.rows}`, elapsedMs: timings[stage] })

    stage = 'destination-canvas-creation'; stageStarted = performance.now()
    checkpoint(stage, 'before', { outputDimensions: `${outputMat.cols}x${outputMat.rows}` })
    const outputCanvas = document.createElement('canvas')
    outputCanvas.width = outputMat.cols; outputCanvas.height = outputMat.rows
    if (outputCanvas.width !== outputMat.cols || outputCanvas.height !== outputMat.rows) throw new Error(`Destination canvas allocation failed for ${outputMat.cols}x${outputMat.rows}`)
    checkpoint(stage, 'after', { canvasDimensions: `${outputCanvas.width}x${outputCanvas.height}` })
    stage = 'destination-rendering'; checkpoint(stage, 'before', { outputDimensions: `${outputMat.cols}x${outputMat.rows}` })
    cv.imshow(outputCanvas, outputMat)
    checkpoint(stage, 'after', { canvasDimensions: `${outputCanvas.width}x${outputCanvas.height}` })
    timings[stage] = performance.now() - stageStarted

    stage = 'jpeg-blob-creation'; stageStarted = performance.now()
    checkpoint(stage, 'before', { canvasDimensions: `${outputCanvas.width}x${outputCanvas.height}`, type: 'image/jpeg', quality: .9 })
    const blob = await canvasToBlob(outputCanvas, 'image/jpeg', .9)
    if (!blob.size) throw new Error('JPEG encoder returned an empty blob')
    timings[stage] = performance.now() - stageStarted
    checkpoint(stage, 'after', { blobBytes: blob.size, blobType: blob.type, elapsedMs: timings[stage] })
    emitDiagnostic('[S&SA processing diagnostics]', { decodeMethod, originalDimensions, workingDimensions: `${width}x${height}`, outputDimensions: `${outputMat.cols}x${outputMat.rows}`, normalizedCorners: corners, pixelCorners: ordered, blobBytes: blob.size, mode, rotation, timings, totalMs: performance.now() - started })
    emitDiagnostic('[S&SA scan timing]', { stage: 'process', dimensions: `${width}x${height}`, output: `${outputMat.cols}x${outputMat.rows}`, processingMs: performance.now() - started })
    return { blob, width: outputMat.cols, height: outputMat.rows }
  } catch (error) {
    const pipelineError = error instanceof ProcessingPipelineError ? error : new ProcessingPipelineError(stage, error)
    emitDiagnostic('[S&SA processing failure]', { stage: pipelineError.stage, file: { type: file.type, bytes: file.size }, corners, mode, rotation, timings, elapsedMs: performance.now() - started, error: serializeDiagnosticError(pipelineError.cause ?? pipelineError) }, 'error')
    throw pipelineError
  } finally {
    image?.release()
    source?.delete(); warped?.delete(); sourcePoints?.delete(); targetPoints?.delete(); transform?.delete()
    if (enhanced && enhanced !== outputMat) enhanced.delete()
    if (rotated && rotated !== outputMat) rotated.delete()
    outputMat?.delete()
  }
}
