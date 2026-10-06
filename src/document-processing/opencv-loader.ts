import { emitDiagnostic, serializeDiagnosticError } from './diagnostics'

export type CvRuntime = Record<string, any>
type ImportResult = Record<string, any>
type LoaderBranch = 'synchronous-ready' | 'synchronous-ready-neutralized' | 'promise-or-thenable' | 'runtime-callback'

function shape(value: unknown) {
  const record = value !== null && (typeof value === 'object' || typeof value === 'function') ? value as Record<string, unknown> : null
  return {
    type: typeof value,
    thenType: typeof record?.then,
    MatType: typeof record?.Mat,
    onRuntimeInitializedType: typeof record?.onRuntimeInitialized,
  }
}

function loaderDiagnostic(importResult: unknown, selected: unknown, branch: LoaderBranch, extra: Record<string, unknown> = {}) {
  const imported = importResult as ImportResult | null
  emitDiagnostic('[S&SA OpenCV loader]', {
    importType: typeof importResult,
    defaultType: typeof imported?.default,
    moduleExportsType: typeof imported?.['module.exports'],
    selected: shape(selected),
    branch,
    ...extra,
  })
}

function readyRuntime(value: unknown, importResult: unknown): CvRuntime | null {
  if (value === null || (typeof value !== 'object' && typeof value !== 'function')) return null
  const cv = value as CvRuntime
  if (typeof cv.Mat !== 'function') return null

  if (typeof cv.then === 'function') {
    // A ready Emscripten runtime can be surfaced by WebKit/Vite with Promise.prototype
    // in its prototype chain but without native Promise internal slots. Shadowing `then`
    // prevents async return/await from trying to assimilate an already-ready runtime.
    try {
      Object.defineProperty(cv, 'then', { configurable: true, value: undefined })
      loaderDiagnostic(importResult, cv, 'synchronous-ready-neutralized')
    } catch (error) {
      loaderDiagnostic(importResult, cv, 'synchronous-ready-neutralized', { neutralizationError: serializeDiagnosticError(error) })
      throw new Error('OpenCV is ready but exposes an unsafe, non-removable then property', { cause: error })
    }
  } else loaderDiagnostic(importResult, cv, 'synchronous-ready')
  return cv
}

function waitForThenable(value: CvRuntime, importResult: unknown) {
  loaderDiagnostic(importResult, value, 'promise-or-thenable')
  return new Promise<CvRuntime>((resolve, reject) => {
    try {
      Reflect.apply(value.then, value, [resolve, reject])
    } catch (error) {
      reject(error)
    }
  })
}

function waitForRuntimeCallback(value: CvRuntime, importResult: unknown) {
  loaderDiagnostic(importResult, value, 'runtime-callback')
  return new Promise<CvRuntime>((resolve, reject) => {
    const previous = typeof value.onRuntimeInitialized === 'function' ? value.onRuntimeInitialized : null
    try {
      value.onRuntimeInitialized = () => {
        try {
          previous?.()
          const ready = readyRuntime(value, importResult)
          if (!ready) throw new Error('OpenCV runtime callback completed without Mat')
          resolve(ready)
        } catch (error) { reject(error) }
      }
    } catch (error) { reject(error) }
  })
}

export async function normalizeOpenCvImport(importResult: unknown): Promise<CvRuntime> {
  const imported = importResult as ImportResult | null
  emitDiagnostic('[S&SA OpenCV import shape]', {
    importType: typeof importResult,
    defaultType: typeof imported?.default,
    moduleExportsType: typeof imported?.['module.exports'],
    default: shape(imported?.default),
    moduleExports: shape(imported?.['module.exports']),
    namespace: shape(importResult),
  })
  const candidates = [imported?.default, imported?.['module.exports'], importResult]
    .filter((value, index, values) => value != null && values.indexOf(value) === index)

  for (const candidate of candidates) {
    const ready = readyRuntime(candidate, importResult)
    if (ready) return ready
  }

  let lastThenableError: unknown = null
  for (const candidate of candidates) {
    if ((typeof candidate === 'object' || typeof candidate === 'function') && typeof (candidate as CvRuntime).then === 'function') {
      try {
        const resolved = await waitForThenable(candidate as CvRuntime, importResult)
        const ready = readyRuntime(resolved, importResult)
        if (ready) return ready
        if (resolved && typeof resolved.onRuntimeInitialized !== 'undefined') return await waitForRuntimeCallback(resolved, importResult)
      } catch (error) {
        lastThenableError = error
        emitDiagnostic('[S&SA OpenCV loader failure]', { branch: 'promise-or-thenable', selected: shape(candidate), error: serializeDiagnosticError(error) }, 'warn')
      }
    }
  }

  for (const candidate of candidates) {
    if (candidate && (typeof candidate === 'object' || typeof candidate === 'function') && 'onRuntimeInitialized' in candidate) {
      return await waitForRuntimeCallback(candidate as CvRuntime, importResult)
    }
  }

  throw new Error('No supported OpenCV initialization shape was found', { cause: lastThenableError })
}

let cachedInitialization: Promise<CvRuntime> | null = null
let initializationMs = 0

async function initializeOpenCv() {
  const started = performance.now()
  const imported = await import('@techstark/opencv-js')
  const cv = await normalizeOpenCvImport(imported)
  initializationMs = performance.now() - started
  return cv
}

export function getOpenCv() {
  if (!cachedInitialization) cachedInitialization = initializeOpenCv()
  return cachedInitialization
}

export function getOpenCvInitializationMs() { return initializationMs }
