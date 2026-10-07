// @ts-check

const WINDOWS_RESERVED_NAME = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i

/** @param {string} value @param {string} [fallback] */
export function sanitizeDocumentName(value, fallback = 'Scan') {
  const withoutPdf = value.trim().replace(/\.pdf$/i, '')
  const safe = withoutPdf.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-').replace(/\s+/g, ' ').replace(/[. ]+$/g, '').trim()
  const usable = safe && !WINDOWS_RESERVED_NAME.test(safe) ? safe : safe ? `${safe}-document` : fallback
  return usable.slice(0, 120).replace(/[. ]+$/g, '') || fallback
}

/** @param {string} value @param {string} fallback @param {Iterable<string>} usedNames */
export function resolveDocumentName(value, fallback, usedNames) {
  const used = new Set([...usedNames].map((name) => name.toLocaleLowerCase()))
  const base = sanitizeDocumentName(value, fallback)
  let name = base
  let suffix = 2
  while (used.has(name.toLocaleLowerCase())) {
    const suffixText = ` (${suffix++})`
    name = `${base.slice(0, Math.max(1, 120 - suffixText.length)).replace(/[. ]+$/g, '')}${suffixText}`
  }
  return name
}

/** @template {{ id: string, name: string, fallbackName: string }} T @param {T[]} documents @returns {(T & { name: string })[]} */
export function resolveDocumentNames(documents) {
  const used = new Set()
  return documents.map((document) => {
    const name = resolveDocumentName(document.name, document.fallbackName, used)
    used.add(name.toLocaleLowerCase())
    return { ...document, name }
  })
}

/** @param {string} name */
export const pdfFilename = (name) => `${name}.pdf`
