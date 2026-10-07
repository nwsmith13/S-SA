// @ts-check
export function originalObjectSuffix(filename, contentType) {
  const match = filename.toLowerCase().match(/\.(jpe?g|png|heic|heif)$/)
  if (match) return match[0]
  return contentType === 'image/png' ? '.png' : contentType.includes('hei') ? '.heic' : '.jpg'
}
export function buildPersistenceManifest({ userId, document, pdfFilename }) {
  const root = `${userId}/${document.id}`
  return {
    document: { id: document.id, user_id: userId, name: document.name, pdf_filename: pdfFilename, page_count: document.pages.length, status: 'completed', pdf_storage_path: `${root}/${pdfFilename}` },
    pages: document.pages.map((page, page_index) => ({ id: page.id, document_id: document.id, user_id: userId, page_index, original_storage_path: `${root}/pages/${page.id}/original${originalObjectSuffix(page.file.name, page.file.type)}`, processed_storage_path: `${root}/pages/${page.id}/processed.jpg`, original_filename: page.file.name, original_content_type: page.file.type || 'application/octet-stream', original_size_bytes: page.file.size, processed_width: page.processed.width, processed_height: page.processed.height, processing_mode: page.mode, rotation: page.rotation, corners: page.corners, detected_corners: page.detectedCorners, detection_confidence: page.confidence })),
  }
}
