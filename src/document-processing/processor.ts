import type { DetectionResult, Point, ProcessedPage, ProcessingMode } from './types'

type Cv = Record<string, any>
type LoadedImage = { source: CanvasImageSource; width: number; height: number; release: () => void }
type Candidate = { points: Point[]; confidence: number; method: DetectionResult['method'] }

let cvPromise: Promise<Cv> | null = null
let cvInitializationMs = 0

async function getCv(): Promise<Cv> {
  if (!cvPromise) {
    const started = performance.now()
    cvPromise = import('@techstark/opencv-js').then(async (module) => {
      const candidate = (module as { default?: any }).default ?? module
      const cv = candidate instanceof Promise ? await candidate : candidate
      if (!cv.Mat) await new Promise<void>((resolve) => { cv.onRuntimeInitialized = resolve })
      cvInitializationMs = performance.now() - started
      return cv
    })
  }
  return cvPromise
}

async function loadImage(file: File): Promise<LoadedImage> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
      return { source: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close() }
    } catch {
      // Safari and HEIC implementations can expose createImageBitmap but still reject a decodable file.
    }
  }

  const url = URL.createObjectURL(file)
  const image = new Image()
  image.decoding = 'async'
  image.src = url
  try {
    await image.decode()
    return { source: image, width: image.naturalWidth, height: image.naturalHeight, release: () => URL.revokeObjectURL(url) }
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

function scoreCandidate(points: Point[], width: number, height: number, contourArea: number, method: Candidate['method']): Candidate | null {
  if (points.length !== 4) return null
  const ordered = orderCorners(points)
  if (isFullImageBoundary(ordered, width, height)) return null
  const areaRatio = polygonArea(ordered) / (width * height)
  if (areaRatio < .10 || areaRatio > .9) return null
  if (ordered.some((point) => point.x < -width * .03 || point.y < -height * .03 || point.x > width * 1.03 || point.y > height * 1.03)) return null

  const edgeLengths = ordered.map((point, index) => distance(point, ordered[(index + 1) % 4]))
  const edgeBalance = Math.min(...edgeLengths) / Math.max(...edgeLengths)
  const rectangularFill = Math.min(1, contourArea / Math.max(1, polygonArea(ordered)))
  const areaScore = 1 - Math.min(1, Math.abs(areaRatio - .52) / .52)
  const normalized = ordered.map((point) => ({ x: point.x / width, y: point.y / height }))
  const inset = Math.min(...normalized.flatMap((point) => [point.x, point.y, 1 - point.x, 1 - point.y]))
  const methodWeight = method === 'light-contour' ? .1 : method === 'edge-contour' ? .06 : 0
  const confidence = Math.max(.2, Math.min(.97, .32 + areaScore * .23 + edgeBalance * .17 + rectangularFill * .16 + Math.min(.08, Math.max(0, inset)) + methodWeight))
  return { points: ordered, confidence, method }
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

function candidatesFromMask(cv: Cv, mask: any, width: number, height: number, method: 'light-contour' | 'edge-contour') {
  const candidates: Candidate[] = []
  const contours = new cv.MatVector()
  const hierarchy = new cv.Mat()
  const working = mask.clone()
  try {
    cv.findContours(working, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE)
    for (let index = 0; index < contours.size(); index += 1) {
      const contour = contours.get(index)
      const perimeter = cv.arcLength(contour, true)
      const contourArea = Math.abs(cv.contourArea(contour))
      if (contourArea < width * height * .08) { contour.delete(); continue }
      let exactFound = false
      try {
        for (const epsilon of [.012, .02, .032, .05, .075]) {
          const approx = new cv.Mat()
          try {
            cv.approxPolyDP(contour, approx, perimeter * epsilon, true)
            if (approx.rows !== 4 || !cv.isContourConvex(approx)) continue
            const candidate = scoreCandidate(matPoints(approx), width, height, contourArea, method)
            if (candidate) { candidates.push(candidate); exactFound = true; break }
          } finally { approx.delete() }
        }

        if (!exactFound) {
          const hull = new cv.Mat()
          try {
            cv.convexHull(contour, hull, false, true)
            const quad = extremeQuad(matPoints(hull))
            const candidate = quad ? scoreCandidate(quad, width, height, contourArea, 'edge-hull') : null
            if (candidate) candidates.push({ ...candidate, confidence: Math.min(candidate.confidence, .68) })
          } finally { hull.delete() }
        }
      } finally { contour.delete() }
    }
  } finally { working.delete(); contours.delete(); hierarchy.delete() }
  return candidates
}

function candidateFromLines(cv: Cv, edges: any, width: number, height: number): Candidate | null {
  const lines = new cv.Mat()
  try {
    cv.HoughLinesP(edges, lines, 1, Math.PI / 180, 45, Math.min(width, height) * .2, Math.min(width, height) * .055)
    const endpoints: Point[] = []
    for (let row = 0; row < lines.rows; row += 1) {
      const line = lines.intPtr(row, 0)
      endpoints.push({ x: line[0], y: line[1] }, { x: line[2], y: line[3] })
    }
    const quad = extremeQuad(endpoints)
    return quad ? scoreCandidate(quad, width, height, polygonArea(quad), 'edge-hull') : null
  } finally { lines.delete() }
}

function grayMedian(gray: any) {
  const samples: number[] = []
  const step = Math.max(1, Math.floor(gray.data.length / 12000))
  for (let index = 0; index < gray.data.length; index += step) samples.push(gray.data[index])
  samples.sort((a, b) => a - b)
  return samples[Math.floor(samples.length / 2)] ?? 100
}

export async function detectDocument(file: File): Promise<DetectionResult> {
  const totalStarted = performance.now()
  const cvWaitStarted = performance.now()
  const cv = await getCv()
  const opencvInitMs = cvInitializationMs || performance.now() - cvWaitStarted
  const decodeStarted = performance.now()
  const image = await loadImage(file)
  const { context, width, height } = drawImage(image, 1600)
  image.release()
  const imageDecodeMs = performance.now() - decodeStarted
  const detectionStarted = performance.now()
  const source = cv.matFromImageData(context.getImageData(0, 0, width, height))
  const gray = new cv.Mat()
  const blurred = new cv.Mat()
  const edges = new cv.Mat()
  const edgeClosed = new cv.Mat()
  const lightMask = new cv.Mat()
  const lightClosed = new cv.Mat()
  const kernel3 = cv.Mat.ones(3, 3, cv.CV_8U)

  try {
    cv.cvtColor(source, gray, cv.COLOR_RGBA2GRAY)
    cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0)
    const median = grayMedian(blurred)
    const low = Math.max(18, Math.min(90, median * .48))
    const high = Math.max(low + 35, Math.min(190, median * 1.25))
    cv.Canny(blurred, edges, low, high)
    cv.morphologyEx(edges, edgeClosed, cv.MORPH_CLOSE, kernel3)

    cv.threshold(blurred, lightMask, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU)
    cv.morphologyEx(lightMask, lightClosed, cv.MORPH_CLOSE, kernel3)

    const candidates = [
      ...candidatesFromMask(cv, lightClosed, width, height, 'light-contour'),
      ...candidatesFromMask(cv, edgeClosed, width, height, 'edge-contour'),
    ]
    const lineCandidate = candidateFromLines(cv, edgeClosed, width, height)
    if (lineCandidate) candidates.push(lineCandidate)
    candidates.sort((a, b) => b.confidence - a.confidence)
    const best = candidates[0]
    const detectionMs = performance.now() - detectionStarted
    const timing = { opencvInitMs, imageDecodeMs, detectionMs, totalMs: performance.now() - totalStarted }
    console.info('[S&SA scan timing]', JSON.stringify({ stage: 'detect', method: best?.method ?? 'none', dimensions: `${width}x${height}`, ...timing }))
    if (!best) throw new Error('No reasonable paper candidate found')
    return { corners: best.points.map((point) => ({ x: point.x / width, y: point.y / height })), confidence: best.confidence, sourceWidth: width, sourceHeight: height, method: best.method, timing }
  } finally {
    source.delete(); gray.delete(); blurred.delete(); edges.delete(); edgeClosed.delete(); lightMask.delete(); lightClosed.delete(); kernel3.delete()
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
  const cv = await getCv()
  const image = await loadImage(file)
  const { context, width, height } = drawImage(image, 2600)
  image.release()
  const ordered = orderCorners(corners.map((point) => ({ x: point.x * width, y: point.y * height })))
  const [topLeft, topRight, bottomRight, bottomLeft] = ordered
  const outputWidth = Math.max(64, Math.round(Math.max(distance(topLeft, topRight), distance(bottomLeft, bottomRight))))
  const outputHeight = Math.max(64, Math.round(Math.max(distance(topLeft, bottomLeft), distance(topRight, bottomRight))))
  const source = cv.matFromImageData(context.getImageData(0, 0, width, height))
  const warped = new cv.Mat()
  const sourcePoints = cv.matFromArray(4, 1, cv.CV_32FC2, ordered.flatMap((point) => [point.x, point.y]))
  const targetPoints = cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, outputWidth - 1, 0, outputWidth - 1, outputHeight - 1, 0, outputHeight - 1])
  const transform = cv.getPerspectiveTransform(sourcePoints, targetPoints)
  let enhanced: any = null
  let rotated: any = null
  try {
    cv.warpPerspective(source, warped, transform, new cv.Size(outputWidth, outputHeight), cv.INTER_LINEAR, cv.BORDER_REPLICATE)
    enhanced = applyEnhancement(cv, warped, mode)
    rotated = new cv.Mat()
    if (rotation === 90) cv.rotate(enhanced, rotated, cv.ROTATE_90_CLOCKWISE)
    else if (rotation === 180) cv.rotate(enhanced, rotated, cv.ROTATE_180)
    else if (rotation === 270) cv.rotate(enhanced, rotated, cv.ROTATE_90_COUNTERCLOCKWISE)
    else enhanced.copyTo(rotated)

    const outputCanvas = document.createElement('canvas')
    outputCanvas.width = rotated.cols; outputCanvas.height = rotated.rows
    const outputContext = outputCanvas.getContext('2d')
    if (!outputContext) throw new Error('Canvas is unavailable')
    const rgba = new Uint8ClampedArray(rotated.cols * rotated.rows * 4)
    if (rotated.channels() === 1) {
      for (let sourceIndex = 0, targetIndex = 0; sourceIndex < rotated.data.length; sourceIndex += 1, targetIndex += 4) {
        const value = rotated.data[sourceIndex]
        rgba[targetIndex] = value; rgba[targetIndex + 1] = value; rgba[targetIndex + 2] = value; rgba[targetIndex + 3] = 255
      }
    } else rgba.set(rotated.data)
    outputContext.putImageData(new ImageData(rgba, rotated.cols, rotated.rows), 0, 0)
    const blob = await canvasToBlob(outputCanvas, 'image/jpeg', .9)
    console.info('[S&SA scan timing]', JSON.stringify({ stage: 'process', dimensions: `${width}x${height}`, output: `${rotated.cols}x${rotated.rows}`, processingMs: performance.now() - started }))
    return { blob, width: rotated.cols, height: rotated.rows }
  } finally {
    source.delete(); warped.delete(); sourcePoints.delete(); targetPoints.delete(); transform.delete(); enhanced?.delete(); rotated?.delete()
  }
}
