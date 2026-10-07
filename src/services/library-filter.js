// @ts-check

/**
 * Conventional Library search index. Add extracted text, dates, entities, and
 * document types here later without changing the Library interaction model.
 * @param {{ name: string, library_folders?: { name?: string } | null }} document
 */
export function librarySearchText(document) {
  return [document.name, document.library_folders?.name ?? ''].join('\n').toLocaleLowerCase()
}

/**
 * @param {Array<{ name: string, folder_id: string | null, library_folders?: { name?: string } | null }>} documents
 * @param {'all' | 'unfiled' | string} view
 * @param {string} query
 */
export function filterLibraryDocuments(documents, view, query) {
  const needle = query.trim().toLocaleLowerCase()
  return documents.filter((document) => {
    const inView = view === 'all' || (view === 'unfiled' ? !document.folder_id : document.folder_id === view)
    return inView && (!needle || librarySearchText(document).includes(needle))
  })
}
