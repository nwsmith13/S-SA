export type DocumentSource = 'camera' | 'file-import'

export type DocumentDraft = {
  id: string
  source: DocumentSource
  originalName: string
  createdAt: string
}
