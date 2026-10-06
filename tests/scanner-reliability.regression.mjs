import assert from 'node:assert/strict'
import { chromium } from 'playwright-core'
import { createServer } from 'vite'

const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const server = await createServer({ logLevel: 'error', server: { host: '127.0.0.1', port: 4183, strictPort: true } })
await server.listen()
const browser = await chromium.launch({ executablePath: edgePath, headless: true })

try {
  const page = await browser.newPage()
  await page.goto('http://127.0.0.1:4183/')
  const result = await page.evaluate(async () => {
    const { assessCandidateQuality } = await import('/src/document-processing/candidate-quality.ts')
    const { commitPageProcessingResult } = await import('/src/document-processing/page-identity.ts')

    const normal = assessCandidateQuality([
      { x: .275, y: .05 }, { x: .725, y: .05 }, { x: .725, y: .95 }, { x: .275, y: .95 },
    ], .968)
    const angled = assessCandidateQuality([
      { x: .20, y: .20 }, { x: .65, y: .10 }, { x: .75, y: .67 }, { x: .27, y: .78 },
    ], .894)
    const borderHugging = assessCandidateQuality([
      { x: 0, y: .113 }, { x: .995, y: .007 }, { x: .988, y: .849 }, { x: .123, y: .831 },
    ], .841)

    let documents = [{ id: 'document-1', pages: [
      { id: 'page-a', processingToken: 'a-new', processedUrl: 'a-original' },
      { id: 'page-b', processingToken: 'b-job', processedUrl: 'b-original' },
    ] }]
    documents = [{ ...documents[0], pages: [documents[0].pages[1], documents[0].pages[0]] }]
    documents = commitPageProcessingResult(documents, 'page-b', 'b-job', (page) => ({ ...page, processedUrl: 'b-result' }))
    documents = commitPageProcessingResult(documents, 'page-a', 'a-stale', (page) => ({ ...page, processedUrl: 'wrong-stale-result' }))
    documents = commitPageProcessingResult(documents, 'page-a', 'a-new', (page) => ({ ...page, processedUrl: 'a-result' }))
    documents = [{ ...documents[0], pages: documents[0].pages.filter((item) => item.id !== 'page-b') }]
    documents = commitPageProcessingResult(documents, 'page-b', 'b-job', (page) => ({ ...page, processedUrl: 'wrong-deleted-result' }))

    return { normal, angled, borderHugging, pages: documents[0].pages }
  })

  assert.equal(result.normal.accepted, true, '0.968 / 0.405 normal candidate was rejected')
  assert.ok(Math.abs(result.normal.areaRatio - .405) < .001, 'Normal candidate fixture area changed')
  assert.equal(result.angled.accepted, true, '0.894 / 0.270 angled candidate was rejected')
  assert.ok(Math.abs(result.angled.areaRatio - .27) < .01, 'Angled candidate fixture area changed')
  assert.equal(result.borderHugging.accepted, false, '0.841 / 0.728 border-hugging candidate was accepted')
  assert.ok(result.borderHugging.reasons.includes('large-region-with-three-border-corners'))
  assert.deepEqual(result.pages, [{ id: 'page-a', processingToken: 'a-new', processedUrl: 'a-result' }], 'Out-of-order processing crossed stable page identity')
  console.log(JSON.stringify(result, null, 2))
} finally {
  await browser.close()
  await server.close()
}
