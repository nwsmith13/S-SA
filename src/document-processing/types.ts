export type Point = { x: number; y: number }

export type ProcessingMode = 'auto' | 'color' | 'grayscale' | 'black-white'

export type ProcessingStatus = 'preparing' | 'finding' | 'cleaning' | 'ready' | 'attention'

export type ProcessedPage = {
  blob: Blob
  width: number
  height: number
}

export type DetectionResult = {
  corners: Point[]
  confidence: number
  sourceWidth: number
  sourceHeight: number
  method: 'light-contour' | 'edge-contour' | 'edge-hull'
  timing: {
    opencvInitMs: number
    imageDecodeMs: number
    detectionMs: number
    totalMs: number
  }
}

export const fullImageCorners = (): Point[] => [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
]
