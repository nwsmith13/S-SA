export type SearchableLibraryDocument = { name: string; folder_id: string | null; library_folders?: { name?: string } | null }
export function librarySearchText(document: SearchableLibraryDocument): string
export function filterLibraryDocuments<T extends SearchableLibraryDocument>(documents: T[], view: 'all' | 'unfiled' | string, query: string): T[]
