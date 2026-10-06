import { emitDiagnostic, serializeDiagnosticError } from './diagnostics'

export type CvRuntime = Record<string, any>
export type CvHandle = { cv: CvRuntime }
type ImportResult = Record<string, any>
type LoaderBranch = 'synchronous-ready' | 'promise-or-thenable' | 'runtime-callback'

function checkpoint(operation: string, phase: 'before' | 'after' | 'failure', details: Record<string, unknown> = {}) {
  emitDiagnostic('[S&SA OpenCV loader checkpoint]', { operation, phase, ...details }, phase === 'failure' ? 'error' : 'info')
}

function safePropertyType(value: unknown, property: string) {
  try {
    if (value === null || (typeof value !== 'object' && typeof value !== 'function')) return 'unavailable'
    return typeof (value as Record<string, unknown>)[property]
  } catch (error) { return `throws:${serializeDiagnosticError(error).name}` }
}

function shape(value: unknown) {
  return { type: typeof value, thenType: safePropertyType(value, 'then'), MatType: safePropertyType(value, 'Mat'), onRuntimeInitializedType: safePropertyType(value, 'onRuntimeInitialized') }
}

function readProperty(value: unknown, property: string) {
  checkpoint(`property:${property}`, 'before', { ownerType: typeof value })
  try {
    const result = value !== null && (typeof value === 'object' || typeof value === 'function') ? (value as Record<string, unknown>)[property] : undefined
    checkpoint(`property:${property}`, 'after', { valueType: typeof result })
    return result
  } catch (error) {
    checkpoint(`property:${property}`, 'failure', { error: serializeDiagnosticError(error) })
    throw error
  }
}

function loaderDiagnostic(importResult: unknown, selected: unknown, branch: LoaderBranch) {
  emitDiagnostic('[S&SA OpenCV loader]', { importType: typeof importResult, selected: shape(selected), branch })
}

function readyRuntime(value: unknown, importResult: unknown): CvHandle | null {
  if (value === null || (typeof value !== 'object' && typeof value !== 'function')) return null
  checkpoint('check-cv-Mat', 'before', { candidateType: typeof value })
  try {
    const Mat = (value as CvRuntime).Mat
    checkpoint('check-cv-Mat', 'after', { MatType: typeof Mat })
    if (typeof Mat !== 'function') return null
    loaderDiagnostic(importResult, value, 'synchronous-ready')
    return { cv: value as CvRuntime }
  } catch (error) {
    checkpoint('check-cv-Mat', 'failure', { error: serializeDiagnosticError(error) })
    throw error
  }
}

function waitForRuntimeCallback(value: CvRuntime, importResult: unknown): Promise<CvHandle> {
  loaderDiagnostic(importResult, value, 'runtime-callback')
  return new Promise<CvHandle>((resolve, reject) => {
    checkpoint('runtime-callback:inspect', 'before')
    let previous: (() => void) | null
    try {
      previous = typeof value.onRuntimeInitialized === 'function' ? value.onRuntimeInitialized : null
      checkpoint('runtime-callback:inspect', 'after', { existingCallbackType: typeof value.onRuntimeInitialized })
    } catch (error) {
      checkpoint('runtime-callback:inspect', 'failure', { error: serializeDiagnosticError(error) })
      reject(error); return
    }
    checkpoint('runtime-callback:install', 'before')
    try {
      value.onRuntimeInitialized = () => {
        checkpoint('runtime-callback:invoked', 'before')
        try {
          previous?.()
          const handle = readyRuntime(value, importResult)
          if (!handle) throw new Error('OpenCV runtime callback completed without Mat')
          checkpoint('runtime-callback:invoked', 'after')
          resolve(handle)
        } catch (error) {
          checkpoint('runtime-callback:invoked', 'failure', { error: serializeDiagnosticError(error) })
          reject(error)
        }
      }
      checkpoint('runtime-callback:install', 'after')
    } catch (error) {
      checkpoint('runtime-callback:install', 'failure', { error: serializeDiagnosticError(error) })
      reject(error)
    }
  })
}

function waitForThenable(value: CvRuntime, importResult: unknown): Promise<CvHandle> {
  loaderDiagnostic(importResult, value, 'promise-or-thenable')
  return new Promise<CvHandle>((resolve, reject) => {
    checkpoint('then:access', 'before', { selected: shape(value) })
    let then: unknown
    try {
      then = value.then
      checkpoint('then:access', 'after', { thenType: typeof then })
    } catch (error) {
      checkpoint('then:access', 'failure', { error: serializeDiagnosticError(error) })
      reject(error); return
    }
    checkpoint('then:invoke', 'before', { thenType: typeof then })
    try {
      Reflect.apply(then as Function, value, [
        (resolved: unknown) => {
          checkpoint('then:fulfilled', 'before', { resolved: shape(resolved) })
          try {
            const handle = readyRuntime(resolved, importResult)
            if (handle) {
              checkpoint('then:fulfilled', 'after', { result: 'ready' })
              resolve(handle)
              return
            }
            const callbackType = safePropertyType(resolved, 'onRuntimeInitialized')
            if (resolved && callbackType !== 'unavailable') {
              checkpoint('then:fulfilled', 'after', { result: 'runtime-callback', callbackType })
              waitForRuntimeCallback(resolved as CvRuntime, importResult).then(resolve, reject)
              return
            }
            throw new Error('OpenCV thenable fulfilled without Mat or a runtime callback')
          } catch (error) {
            checkpoint('then:fulfilled', 'failure', { error: serializeDiagnosticError(error) })
            reject(error)
          }
        },
        (error: unknown) => {
          checkpoint('then:rejected', 'failure', { error: serializeDiagnosticError(error) })
          reject(error)
        },
      ])
      checkpoint('then:invoke', 'after')
    } catch (error) {
      checkpoint('then:invoke', 'failure', { error: serializeDiagnosticError(error) })
      reject(error)
    }
  })
}

export async function normalizeOpenCvImport(importResult: unknown): Promise<CvHandle> {
  checkpoint('normalize-import', 'before', { importType: typeof importResult })
  const defaultExport = readProperty(importResult, 'default')
  const moduleExports = readProperty(importResult, 'module.exports')
  const candidates = [defaultExport, moduleExports, importResult].filter((value, index, values) => value != null && values.indexOf(value) === index)
  checkpoint('normalize-import', 'after', { candidates: candidates.map(shape) })
  for (const candidate of candidates) {
    const handle = readyRuntime(candidate, importResult)
    if (handle) return handle
  }

  let lastThenableError: unknown = null
  for (const candidate of candidates) {
    checkpoint('then:inspect', 'before', { candidate: shape(candidate) })
    const thenType = safePropertyType(candidate, 'then')
    checkpoint('then:inspect', 'after', { thenType })
    if (thenType === 'function') {
      try { return await waitForThenable(candidate as CvRuntime, importResult) }
      catch (error) {
        lastThenableError = error
        emitDiagnostic('[S&SA OpenCV loader failure]', { branch: 'promise-or-thenable', selected: shape(candidate), error: serializeDiagnosticError(error) }, 'warn')
      }
    }
  }
  for (const candidate of candidates) {
    checkpoint('runtime-callback:availability', 'before', { candidate: shape(candidate) })
    const callbackType = safePropertyType(candidate, 'onRuntimeInitialized')
    checkpoint('runtime-callback:availability', 'after', { callbackType })
    if (callbackType !== 'unavailable') return await waitForRuntimeCallback(candidate as CvRuntime, importResult)
  }
  throw new Error('No supported OpenCV initialization shape was found', { cause: lastThenableError })
}

function importOpenCvModule(): Promise<{ imported: unknown }> {
  checkpoint('dynamic-import:create', 'before')
  let importPromise: Promise<unknown>
  try {
    importPromise = import('@techstark/opencv-js')
    checkpoint('dynamic-import:create', 'after', { promise: shape(importPromise) })
  } catch (error) {
    checkpoint('dynamic-import:create', 'failure', { error: serializeDiagnosticError(error) })
    return Promise.reject(error)
  }
  return new Promise<{ imported: unknown }>((resolve, reject) => {
    checkpoint('dynamic-import:handlers', 'before')
    try {
      Reflect.apply(importPromise.then, importPromise, [
        (imported: unknown) => {
          checkpoint('dynamic-import:fulfilled', 'after', { importType: typeof imported })
          resolve({ imported })
        },
        (error: unknown) => {
          checkpoint('dynamic-import:rejected', 'failure', { error: serializeDiagnosticError(error) })
          reject(error)
        },
      ])
      checkpoint('dynamic-import:handlers', 'after')
    } catch (error) {
      checkpoint('dynamic-import:handlers', 'failure', { error: serializeDiagnosticError(error) })
      reject(error)
    }
  })
}

let cachedInitialization: Promise<CvHandle> | null = null
let initializationMs = 0

async function initializeOpenCv(): Promise<CvHandle> {
  const started = performance.now()
  const importedHandle = await importOpenCvModule()
  checkpoint('normalizer:call', 'before')
  try {
    const cvHandle = await normalizeOpenCvImport(importedHandle.imported)
    checkpoint('normalizer:call', 'after', { cv: shape(cvHandle.cv) })
    initializationMs = performance.now() - started
    return cvHandle
  } catch (error) {
    checkpoint('normalizer:call', 'failure', { error: serializeDiagnosticError(error) })
    throw error
  }
}

export function getOpenCv() {
  if (!cachedInitialization) cachedInitialization = initializeOpenCv()
  return cachedInitialization
}

export function getOpenCvInitializationMs() { return initializationMs }
