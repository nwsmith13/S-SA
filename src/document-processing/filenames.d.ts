export type NamedDocument = { id: string; name: string; fallbackName: string }
export function sanitizeDocumentName(value: string, fallback?: string): string
export function resolveDocumentNames<T extends NamedDocument>(documents: T[]): Array<T & { name: string }>
export function pdfFilename(name: string): string
