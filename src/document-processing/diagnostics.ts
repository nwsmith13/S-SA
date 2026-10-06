export type DiagnosticLevel = 'info' | 'warn' | 'error'

export type DiagnosticEvent = {
  id: number
  timestamp: string
  label: string
  level: DiagnosticLevel
  payload: unknown
}

const maximumEvents = 100
const listeners = new Set<() => void>()
let nextId = 1
let events: DiagnosticEvent[] = []

export function serializeDiagnosticError(error: unknown) {
  if (error instanceof Error) return { name: error.name, message: error.message, stack: error.stack }
  return { name: 'UnknownError', message: String(error) }
}

export function emitDiagnostic(label: string, payload: unknown, level: DiagnosticLevel = 'info') {
  const event = { id: nextId++, timestamp: new Date().toISOString(), label, level, payload }
  events = [...events.slice(-(maximumEvents - 1)), event]
  listeners.forEach((listener) => listener())

  const method = level === 'error' ? console.error : level === 'warn' ? console.warn : console.info
  method(label, JSON.stringify(payload))
  return event
}

export function getDiagnosticEvents() { return events }

export function subscribeToDiagnostics(listener: () => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}
