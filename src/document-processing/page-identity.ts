export type ProcessingIdentityPage = { id: string; processingToken?: string }
export type ProcessingIdentityDocument<TPage extends ProcessingIdentityPage> = { pages: TPage[] }

export function commitPageProcessingResult<TPage extends ProcessingIdentityPage, TDocument extends ProcessingIdentityDocument<TPage>>(
  documents: TDocument[],
  pageId: string,
  processingToken: string,
  commit: (page: TPage) => TPage,
  discard?: (reason: 'stale-token' | 'missing-page') => void,
) {
  let foundPage = false
  let committed = false
  const next = documents.map((document) => ({
    ...document,
    pages: document.pages.map((page) => {
      if (page.id !== pageId) return page
      foundPage = true
      if (page.processingToken !== processingToken) return page
      committed = true
      return commit(page)
    }),
  }))
  if (!committed) discard?.(foundPage ? 'stale-token' : 'missing-page')
  return next
}
