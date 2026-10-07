export type PersistencePage = { id: string; file: File; processed: { blob: Blob; width: number; height: number }; mode: string; rotation: number; corners: unknown; detectedCorners: unknown; confidence: number }
export type PersistenceDocument = { id: string; name: string; pages: PersistencePage[] }
export function originalObjectSuffix(filename: string, contentType: string): string
export function buildPersistenceManifest(input: { userId: string; document: PersistenceDocument; pdfFilename: string }): { document: Record<string, unknown>; pages: Record<string, unknown>[] }
