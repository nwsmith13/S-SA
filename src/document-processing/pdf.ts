import type { ProcessedPage } from './types'

export async function createDocumentPdf(pages: ProcessedPage[]) {
  const { jsPDF } = await import('jspdf')
  const first = pageSize(pages[0])
  const pdf = new jsPDF({ unit: 'pt', format: [first.width, first.height], orientation: first.width > first.height ? 'landscape' : 'portrait', compress: true })

  for (let index = 0; index < pages.length; index += 1) {
    const page = pages[index]
    const size = pageSize(page)
    if (index > 0) pdf.addPage([size.width, size.height], size.width > size.height ? 'landscape' : 'portrait')
    const bytes = new Uint8Array(await page.blob.arrayBuffer())
    pdf.addImage(bytes, 'JPEG', 0, 0, size.width, size.height, undefined, 'FAST')
  }
  return pdf.output('blob')
}

function pageSize(page: ProcessedPage) {
  const maxSide = 792
  const scale = maxSide / Math.max(page.width, page.height)
  return { width: Math.round(page.width * scale), height: Math.round(page.height * scale) }
}
