import type { DetectionResult, Point, ProcessedPage, ProcessingMode } from './types'

type Cv = Record<string, any>

let cvPromise: Promise<Cv> | null = null

async function getCv(): Promise<Cv> {
  if (!cvPromise) {
    cvPromise = import('@techstark/opencv-js').then(async (module) => {
      const candidate = (module as { default?: any }).default ?? module
      if (candidate instanceof Promise) return candidate
      if (candidate.Mat) return candidate
      await new Promise<void>((resolve) => { candidate.onRuntimeInitialized = resolve })
      return candidate
    })
  }
  return cvPromise
}

async function loadBitmap(file: File) {
  return createImageBitmap(file, { imageOrientation: 'from-image' })
}

function drawBitmap(bitmap: ImageBitmap, maxDimension: number) {
  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height))
  const width = Math.max(1, Math.round(bitmap.width * scale))
  const height = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = new OffscreenCanvas(width, height)
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('Canvas is unavailable')
  context.drawImage(bitmap, 0, 0, width, height)
  return { canvas, context, width, height }
}

function orderCorners(points: Point[]): Point[] {
  const sum = points.map((point) => point.x + point.y)
  const diff = points.map((point) => point.y - point.x)
  return [
    points[sum.indexOf(Math.min(...sum))],
    points[diff.indexOf(Math.min(...diff))],
    points[sum.indexOf(Math.max(...sum))],
    points[diff.indexOf(Math.max(...diff))],
  ]
}

function distance(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function cornerQuality(points: Point[], width: number, height: number, areaRatio: number) {
  const normalized = points.map((point) => ({ x: point.x / width, y: point.y / height }))
  const borderDistance = Math.min(...normalized.flatMap((point) => [point.x, point.y, 1 - point.x, 1 - point.y]))
  const edges = points.map((point, index) => distance(point, points[(index + 1) % 4]))
  const edgeBalance = Math.min(...edges) / Math.max(...edges)
  const confidence = Math.min(0.98, Math.max(0, areaRatio * 0.9 + edgeBalance * 0.28 + Math.min(borderDistance, .12)))
  return confidence
}

export async function detectDocument(file: File): Promise<DetectionResult> {
  const [cv, bitmap] = await Promise.all([getCv(), loadBitmap(file)])
  const { context, width, height } = drawBitmap(bitmap, 1200)
  bitmap.close()
  const source = cv.matFromImageData(context.getImageData(0, 0, width, height))
  const gray = new cv.Mat()
  const blurred = new cv.Mat()
  const edges = new cv.Mat()
  const closed = new cv.Mat()
  const contours = new cv.MatVector()
  const hierarchy = new cv.Mat()
  const kernel = cv.Mat.ones(5, 5, cv.CV_8U)
  let best: { points: Point[]; area: number; confidence: number } | null = null

  try {
    cv.cvtColor(source, gray, cv.COLOR_RGBA2GRAY)
    cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0)
    cv.Canny(blurred, edges, 45, 135)
    cv.morphologyEx(edges, closed, cv.MORPH_CLOSE, kernel)
    cv.findContours(closed, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE)

    const imageArea = width * height
    for (let index = 0; index < contours.size(); index += 1) {
      const contour = contours.get(index)
      const perimeter = cv.arcLength(contour, true)
      const approx = new cv.Mat()
      try {
        cv.approxPolyDP(contour, approx, perimeter * .025, true)
        const area = Math.abs(cv.contourArea(approx))
        if (approx.rows !== 4 || area < imageArea * .12 || area > imageArea * .995 || !cv.isContourConvex(approx)) continue
        const raw: Point[] = []
        for (let row = 0; row < 4; row += 1) raw.push({ x: approx.intPtr(row, 0)[0], y: approx.intPtr(row, 0)[1] })
        const points = orderCorners(raw)
        const confidence = cornerQuality(points, width, height, area / imageArea)
        if (!best || confidence > best.confidence) best = { points, area, confidence }
      } finally {
        approx.delete()
        contour.delete()
      }
    }

    if (!best) throw new Error('No reliable paper boundary found')
    return {
      corners: best.points.map((point) => ({ x: point.x / width, y: point.y / height })),
      confidence: best.confidence,
      sourceWidth: width,
      sourceHeight: height,
    }
  } finally {
    source.delete(); gray.delete(); blurred.delete(); edges.delete(); closed.delete(); contours.delete(); hierarchy.delete(); kernel.delete()
  }
}

function applyEnhancement(cv: Cv, source: any, mode: ProcessingMode) {
  if (mode === 'black-white') {
    const gray = new cv.Mat()
    const output = new cv.Mat()
    cv.cvtColor(source, gray, cv.COLOR_RGBA2GRAY)
    cv.adaptiveThreshold(gray, output, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY, 35, 11)
    gray.delete()
    return output
  }

  if (mode === 'grayscale') {
    const gray = new cv.Mat()
    const output = new cv.Mat()
    cv.cvtColor(source, gray, cv.COLOR_RGBA2GRAY)
    cv.convertScaleAbs(gray, output, 1.08, -5)
    gray.delete()
    return output
  }

  const output = new cv.Mat()
  const alpha = mode === 'color' ? 1.08 : 1.04
  const beta = mode === 'color' ? -4 : -2
  cv.convertScaleAbs(source, output, alpha, beta)
  return output
}

export async function processDocument(file: File, corners: Point[], mode: ProcessingMode, rotation: number): Promise<ProcessedPage> {
  const [cv, bitmap] = await Promise.all([getCv(), loadBitmap(file)])
  const { context, width, height } = drawBitmap(bitmap, 2600)
  bitmap.close()
  const ordered = orderCorners(corners.map((point) => ({ x: point.x * width, y: point.y * height })))
  const [topLeft, topRight, bottomRight, bottomLeft] = ordered
  let outputWidth = Math.max(distance(topLeft, topRight), distance(bottomLeft, bottomRight))
  let outputHeight = Math.max(distance(topLeft, bottomLeft), distance(topRight, bottomRight))
  outputWidth = Math.max(64, Math.round(outputWidth))
  outputHeight = Math.max(64, Math.round(outputHeight))

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

    const outputCanvas = new OffscreenCanvas(rotated.cols, rotated.rows)
    const outputContext = outputCanvas.getContext('2d')
    if (!outputContext) throw new Error('Canvas is unavailable')
    const channels = rotated.channels()
    const rgba = new Uint8ClampedArray(rotated.cols * rotated.rows * 4)
    if (channels === 1) {
      for (let sourceIndex = 0, targetIndex = 0; sourceIndex < rotated.data.length; sourceIndex += 1, targetIndex += 4) {
        const value = rotated.data[sourceIndex]
        rgba[targetIndex] = value; rgba[targetIndex + 1] = value; rgba[targetIndex + 2] = value; rgba[targetIndex + 3] = 255
      }
    } else {
      rgba.set(rotated.data)
    }
    outputContext.putImageData(new ImageData(rgba, rotated.cols, rotated.rows), 0, 0)
    const blob = await outputCanvas.convertToBlob({ type: 'image/jpeg', quality: .9 })
    return { blob, width: rotated.cols, height: rotated.rows }
  } finally {
    source.delete(); warped.delete(); sourcePoints.delete(); targetPoints.delete(); transform.delete(); enhanced?.delete(); rotated?.delete()
  }
}
