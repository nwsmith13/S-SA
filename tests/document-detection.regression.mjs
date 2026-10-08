import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'
import { createServer } from 'vite'

const testDirectory = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(testDirectory, '..')
const fixture = path.join(testDirectory, 'fixtures', 'iphone-light-paper-dark-fabric-overlap.png')
const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const timing = []
const diagnostics = []

const server = await createServer({ root: projectRoot, logLevel: 'error', server: { host: '127.0.0.1', port: 4178, strictPort: true } })
await server.listen()
const browser = await chromium.launch({ executablePath: edgePath, headless: true })

try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })
  page.on('console', (message) => {
    if (message.text().startsWith('[S&SA scan timing]')) timing.push(message.text())
    if (message.text().startsWith('[S&SA detection diagnostics]') || message.text().startsWith('[S&SA detection UI result]') || message.text().startsWith('[S&SA CornerEditor geometry]') || message.text().startsWith('[S&SA GEOMETRY WARNING]') || message.text().startsWith('[S&SA processing diagnostics]')) diagnostics.push(message.text())
  })
  await page.goto('http://127.0.0.1:4178/scan?diagnostics=1')
  const diagnosticPanel = page.locator('.diagnostics-panel')
  assert.equal(await diagnosticPanel.getAttribute('open'), null, 'Diagnostics panel must be collapsed by default')
  await page.locator('input[type="file"][multiple]').setInputFiles(fixture)
  await page.locator('.page-status').waitFor({ state: 'visible', timeout: 30_000 })
  await page.waitForFunction(() => ['Ready', 'Check the edges'].includes(document.querySelector('.page-status')?.textContent?.trim() ?? ''), undefined, { timeout: 30_000 })

  const mobileReviewLayout = await page.evaluate(() => {
    const card = document.querySelector('.page-card').getBoundingClientRect()
    const preview = document.querySelector('.page-image-wrap').getBoundingClientRect()
    const grid = document.querySelector('.page-grid').getBoundingClientRect()
    const review = document.querySelector('.page-review').getBoundingClientRect()
    const cardStyle = getComputedStyle(document.querySelector('.page-card'))
    const adjust = document.querySelector('.adjust-edges').getBoundingClientRect()
    const controls = [...document.querySelectorAll('.page-card-actions button')].map((button) => button.getBoundingClientRect())
    return { viewportWidth: innerWidth, documentWidth: document.documentElement.scrollWidth, reviewWidth: review.width, gridWidth: grid.width, cardWidth: card.width, cardLeft: card.left, cardRight: card.right, gridLeft: grid.left, gridRight: grid.right, cardCssWidth: cardStyle.width, cardMaxWidth: cardStyle.maxWidth, previewWidth: preview.width, previewHeight: preview.height, adjustHeight: adjust.height, controlSizes: controls.map((rect) => ({ width: rect.width, height: rect.height })) }
  })
  assert.ok(mobileReviewLayout.documentWidth <= mobileReviewLayout.viewportWidth, `Mobile review has horizontal overflow: ${JSON.stringify(mobileReviewLayout)}`)
  assert.ok(mobileReviewLayout.cardWidth / mobileReviewLayout.gridWidth >= .995, `Phone card does not fill its review grid: ${JSON.stringify(mobileReviewLayout)}`)
  assert.ok(Math.abs(mobileReviewLayout.cardLeft - mobileReviewLayout.gridLeft) <= 1 && Math.abs(mobileReviewLayout.cardRight - mobileReviewLayout.gridRight) <= 1, `Phone card is not aligned to both review-grid edges: ${JSON.stringify(mobileReviewLayout)}`)
  assert.ok(mobileReviewLayout.cardWidth - mobileReviewLayout.previewWidth <= 2.5 && mobileReviewLayout.previewHeight > 400, `Phone preview does not fill the card's inner width: ${JSON.stringify(mobileReviewLayout)}`)
  assert.equal(mobileReviewLayout.cardMaxWidth, 'none', 'Phone card retained a desktop max-width constraint')
  assert.ok(mobileReviewLayout.adjustHeight >= 48, 'Adjust edges is not comfortably tappable')
  assert.ok(mobileReviewLayout.controlSizes.every((control) => control.width >= 44 && control.height >= 44), 'A mobile page action has an undersized touch target')
  const mobileMultiCardLayout = await page.evaluate(() => {
    const grid = document.querySelector('.page-grid'); const original = grid.querySelector('.page-card'); const clones = [original.cloneNode(true), original.cloneNode(true)]
    clones.forEach((clone) => grid.append(clone))
    const cards = [...grid.querySelectorAll('.page-card')].map((card) => { const rect = card.getBoundingClientRect(); return { left: rect.left, top: rect.top, width: rect.width } })
    clones.forEach((clone) => clone.remove())
    return { gridWidth: grid.getBoundingClientRect().width, cards }
  })
  assert.ok(mobileMultiCardLayout.cards.every((card) => card.width / mobileMultiCardLayout.gridWidth >= .995), `Multiple phone cards do not fill the review grid: ${JSON.stringify(mobileMultiCardLayout)}`)
  assert.equal(new Set(mobileMultiCardLayout.cards.map((card) => Math.round(card.left))).size, 1, 'Multiple phone cards formed side-by-side columns')
  assert.equal(new Set(mobileMultiCardLayout.cards.map((card) => Math.round(card.top))).size, mobileMultiCardLayout.cards.length, 'Multiple phone cards did not form separate rows')

  await page.setViewportSize({ width: 430, height: 932 })
  const breakpointLayout = await page.evaluate(() => {
    const card = document.querySelector('.page-card').getBoundingClientRect(); const grid = document.querySelector('.page-grid').getBoundingClientRect(); const preview = document.querySelector('.page-image-wrap').getBoundingClientRect()
    return { breakpointMatches: matchMedia('(max-width: 430px)').matches, cardWidth: card.width, gridWidth: grid.width, previewWidth: preview.width, documentWidth: document.documentElement.scrollWidth, viewportWidth: innerWidth }
  })
  assert.equal(breakpointLayout.breakpointMatches, true, 'Phone breakpoint did not activate at 430px')
  assert.ok(breakpointLayout.cardWidth / breakpointLayout.gridWidth >= .995, `Card does not fill the grid at the 430px breakpoint: ${JSON.stringify(breakpointLayout)}`)
  assert.ok(breakpointLayout.cardWidth - breakpointLayout.previewWidth <= 2.5, `Preview does not fill the card's inner width at the 430px breakpoint: ${JSON.stringify(breakpointLayout)}`)
  assert.ok(breakpointLayout.documentWidth <= breakpointLayout.viewportWidth, `430px review has horizontal overflow: ${JSON.stringify(breakpointLayout)}`)

  await page.setViewportSize({ width: 440, height: 932 })
  const largerPhoneLayout = await page.evaluate(() => {
    const grid = document.querySelector('.page-grid').getBoundingClientRect(); const card = document.querySelector('.page-card').getBoundingClientRect()
    return { gridWidth: grid.width, cardWidth: card.width, gridLeft: grid.left, cardLeft: card.left }
  })
  assert.ok(largerPhoneLayout.cardWidth / largerPhoneLayout.gridWidth >= .995, `Single page retained an empty second column above the 430px breakpoint: ${JSON.stringify(largerPhoneLayout)}`)

  await page.setViewportSize({ width: 1200, height: 900 })
  const desktopReviewLayout = await page.evaluate(() => ({ cardWidth: document.querySelector('.page-card').getBoundingClientRect().width, gridWidth: document.querySelector('.page-grid').getBoundingClientRect().width, documentWidth: document.documentElement.scrollWidth, viewportWidth: innerWidth }))
  assert.ok(desktopReviewLayout.documentWidth <= desktopReviewLayout.viewportWidth, `Desktop review has horizontal overflow: ${JSON.stringify(desktopReviewLayout)}`)
  assert.ok(desktopReviewLayout.cardWidth < desktopReviewLayout.gridWidth / 2, 'Desktop page card expanded into an inefficient single-column layout')
  const desktopMultiCardLayout = await page.evaluate(() => {
    const grid = document.querySelector('.page-grid'); const original = grid.querySelector('.page-card'); const clones = [original.cloneNode(true), original.cloneNode(true), original.cloneNode(true)]
    clones.forEach((clone) => grid.append(clone))
    const cards = [...grid.querySelectorAll('.page-card')].map((card) => { const rect = card.getBoundingClientRect(); return { left: rect.left, top: rect.top, width: rect.width } })
    clones.forEach((clone) => clone.remove())
    return cards
  })
  assert.ok(new Set(desktopMultiCardLayout.map((card) => Math.round(card.left))).size >= 3, `Desktop cards did not form an efficient multi-column grid: ${JSON.stringify(desktopMultiCardLayout)}`)
  await page.setViewportSize({ width: 390, height: 844 })

  if (!(await page.locator('.edge-editor').isVisible())) await page.getByRole('button', { name: 'Adjust edges' }).click()
  const corners = await page.locator('.corner-handle').evaluateAll((handles) => handles.map((handle) => ({
    x: Number.parseFloat(handle.style.left) / 100,
    y: Number.parseFloat(handle.style.top) / 100,
  })))
  assert.equal(corners.length, 4, 'Expected four detected corners')

  const area = Math.abs(corners.reduce((sum, point, index) => {
    const next = corners[(index + 1) % corners.length]
    return sum + point.x * next.y - next.x * point.y
  }, 0) / 2)
  const minX = Math.min(...corners.map((point) => point.x))
  const maxX = Math.max(...corners.map((point) => point.x))
  const minY = Math.min(...corners.map((point) => point.y))
  const maxY = Math.max(...corners.map((point) => point.y))

  assert.ok(minX > .035 && minY > .035 && maxX < .965 && maxY < .965, `Candidate hugs the image boundary: ${JSON.stringify(corners)}`)
  assert.ok(area > .28 && area < .82, `Candidate area ${area.toFixed(3)} does not resemble the foreground sheet`)
  assert.ok(maxX - minX > .48 && maxY - minY > .48, 'Candidate is too small to represent the foreground document')
  assert.ok(timing.some((entry) => entry.includes('"stage":"detect"')), 'Detection timing was not emitted')
  assert.ok(diagnostics.some((entry) => entry.includes('"stages":{"light"')), 'Candidate-stage diagnostics were not emitted')
  assert.ok(diagnostics.some((entry) => entry.includes('"timings":{"opencv-initialization"')), 'Apply stage diagnostics were not emitted')
  const detectionEvent = diagnostics.find((entry) => entry.startsWith('[S&SA detection diagnostics]'))
  const uiResultEvent = diagnostics.find((entry) => entry.startsWith('[S&SA detection UI result]'))
  assert.ok(detectionEvent && uiResultEvent, 'Page-correlated detection events were not emitted')
  const detectionPayload = JSON.parse(detectionEvent.slice(detectionEvent.indexOf('{')))
  const uiResultPayload = JSON.parse(uiResultEvent.slice(uiResultEvent.indexOf('{')))
  assert.equal(typeof detectionPayload.identity.pageId, 'string')
  assert.equal(typeof detectionPayload.identity.documentId, 'string')
  assert.equal(detectionPayload.identity.pageIndex, 0)
  assert.equal(detectionPayload.identity.pageNumber, 1)
  assert.equal(detectionPayload.identity.pageId, uiResultPayload.pageId, 'Detector and UI result refer to different pages')
  assert.equal(detectionPayload.identity.documentId, uiResultPayload.documentId, 'Detector and UI result refer to different documents')
  assert.equal(detectionPayload.result.state, 'auto-apply')
  assert.equal(detectionPayload.result.cornerSource, 'not-required')
  assert.equal(detectionPayload.result.editorCorners, null)
  assert.equal(typeof detectionPayload.result.selectedCandidateIndex, 'number')
  assert.equal(typeof detectionPayload.result.candidateConfidence, 'number')
  assert.equal(typeof detectionPayload.result.agreement.corroborated, 'boolean')
  assert.equal(typeof detectionPayload.file.lastModified, 'number')
  assert.deepEqual(detectionPayload.result.geometryTrace.detectorCandidate.corners.map((corner) => corner.label), ['P0', 'P1', 'P2', 'P3'])
  assert.equal(detectionPayload.result.geometryTrace.orderedCandidate.corners[0].label, 'TL')
  assert.equal(typeof detectionPayload.result.geometryTrace.transition.cornerOrderChanged, 'boolean')
  const acceptedCandidate = detectionPayload.candidates.find((candidate) => candidate.accepted)
  assert.equal(typeof acceptedCandidate.contextMeasurements.boundingBox.widthRatio, 'number')
  assert.equal(typeof acceptedCandidate.contextMeasurements.boundingBox.heightRatio, 'number')
  assert.equal(typeof acceptedCandidate.contextMeasurements.centroid.x, 'number')
  assert.equal(acceptedCandidate.contextMeasurements.outwardEdgeEvidence.length, 4)
  assert.equal(typeof acceptedCandidate.contextMeasurements.outwardEdgeEvidence[0].searchRegion.type, 'string')
  assert.equal(typeof acceptedCandidate.contextMeasurements.outwardEdgeEvidence[0].samplesEvaluated, 'number')
  assert.equal(typeof acceptedCandidate.contextMeasurements.outwardEdgeEvidence[0].pixelsEvaluated, 'number')
  assert.equal(typeof acceptedCandidate.contextMeasurements.outwardEdgeEvidence[0].samplesSatisfyingStrongEdgeCriterion, 'number')
  assert.equal(typeof acceptedCandidate.contextMeasurements.outwardEdgeEvidence[0].rawEvidenceRatio, 'number')
  acceptedCandidate.contextMeasurements.outwardEdgeEvidence.forEach((evidence, index) => {
    assert.ok(Math.hypot(evidence.searchRegion.end.x - evidence.searchRegion.start.x, evidence.searchRegion.end.y - evidence.searchRegion.start.y) > 1, `Accepted candidate edge ${index} has a zero-length diagnostic ray`)
    assert.ok(evidence.samplesEvaluated > 0, `Accepted candidate edge ${index} evaluated no outward samples`)
  })
  assert.equal(typeof acceptedCandidate.contextMeasurements.imageAreaOutsideCandidatePercent, 'number')
  assert.ok(Array.isArray(detectionPayload.pairwiseAcceptedCandidateComparisons))

  const expectedForeground = [{ x: .10, y: .18 }, { x: .80, y: .18 }, { x: .83, y: .84 }, { x: .09, y: .84 }]
  const distances = corners.map((point, index) => Math.hypot(point.x - expectedForeground[index].x, point.y - expectedForeground[index].y))
  assert.ok(distances.reduce((sum, value) => sum + value, 0) / distances.length < .09, `Candidate does not approximate the foreground document: ${JSON.stringify(corners)}`)
  assert.ok(distances.filter((value) => value < .08).length >= 3, 'Fewer than three corners are close to the foreground document')

  const processedBefore = await page.getByRole('button', { name: 'Review page 1' }).locator('img').getAttribute('src')
  await page.waitForTimeout(100)
  const editorInputEvent = diagnostics.find((entry) => entry.startsWith('[S&SA CornerEditor geometry]') && entry.includes('"stage":"CornerEditor-input"'))
  const renderedHandlesEvent = diagnostics.find((entry) => entry.startsWith('[S&SA CornerEditor geometry]') && entry.includes('"stage":"rendered-handles"'))
  assert.ok(editorInputEvent && renderedHandlesEvent, 'CornerEditor geometry stages were not emitted')
  const editorInputPayload = JSON.parse(editorInputEvent.slice(editorInputEvent.indexOf('{')))
  const renderedHandlesPayload = JSON.parse(renderedHandlesEvent.slice(renderedHandlesEvent.indexOf('{')))
  assert.equal(editorInputPayload.cornerEditorInput.corners.length, 4)
  assert.equal(renderedHandlesPayload.intrinsicImage.width > 0, true)
  assert.equal(renderedHandlesPayload.renderedImageBounds.width > 0, true)
  assert.equal(renderedHandlesPayload.renderedHandles.corners.length, 4)
  assert.deepEqual(renderedHandlesPayload.renderedHandles.corners.map((corner) => corner.label), ['TL', 'TR', 'BR', 'BL'])
  const editorProtection = await page.locator('.edge-image-frame').evaluate((element) => ({
    userSelect: getComputedStyle(element).userSelect,
    webkitUserSelect: getComputedStyle(element).getPropertyValue('-webkit-user-select'),
    touchAction: getComputedStyle(element.querySelector('.edge-overlay')).touchAction,
    imageDraggable: element.querySelector('img').draggable,
  }))
  assert.equal(editorProtection.userSelect, 'none', 'Corner surface permits text selection')
  assert.equal(editorProtection.webkitUserSelect, 'none', 'Corner surface permits Safari text selection')
  assert.equal(editorProtection.touchAction, 'none', 'Corner surface permits browser touch gestures')
  assert.equal(editorProtection.imageDraggable, false, 'Original image permits native browser dragging')

  const cdp = await page.context().newCDPSession(page)
  const directions = [[28, 24], [-18, 18], [-18, -18], [18, -18]]
  const movedHandles = []
  const scrollBefore = await page.evaluate(() => scrollY)
  for (let index = 0; index < 4; index += 1) {
    const handle = page.locator('.corner-handle').nth(index)
    const before = await handle.getAttribute('style')
    const box = await handle.boundingBox()
    assert.ok(box, `Corner ${index + 1} has no visible touch target`)
    const start = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
    const end = { x: start.x + directions[index][0], y: start.y + directions[index][1] }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...start, id: index + 1, radiusX: 12, radiusY: 12 }] })
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...end, id: index + 1, radiusX: 12, radiusY: 12 }] })
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    const after = await handle.getAttribute('style')
    assert.notEqual(after, before, `Corner ${index + 1} did not respond independently to touch dragging`)
    movedHandles.push(after)
  }
  assert.equal(await page.evaluate(() => window.getSelection()?.toString() ?? ''), '', 'Corner dragging selected page text')
  assert.equal(await page.evaluate(() => scrollY), scrollBefore, 'Corner dragging scrolled the page')
  const manualPosition = movedHandles[0]

  const applyingVisible = page.getByText('Applying your edges…').waitFor({ state: 'visible', timeout: 2_000 })
  await page.getByRole('button', { name: 'Apply', exact: true }).click()
  await applyingVisible
  await page.locator('.edge-editor').waitFor({ state: 'hidden', timeout: 30_000 })
  await page.waitForFunction(() => document.querySelector('.page-status')?.textContent?.trim() === 'Ready', undefined, { timeout: 30_000 })
  const processedAfter = await page.getByRole('button', { name: 'Review page 1' }).locator('img').getAttribute('src')
  assert.notEqual(processedAfter, processedBefore, 'Apply did not replace the processed page')

  await page.getByRole('button', { name: 'Adjust edges' }).click()
  assert.equal(await page.locator('.corner-handle').first().getAttribute('style'), manualPosition, 'Manual corner coordinates were not retained')
  await page.getByRole('button', { name: 'Close edge adjustment' }).click()
  await diagnosticPanel.locator('summary').click()
  const diagnosticCopy = diagnosticPanel.locator('textarea')
  await diagnosticCopy.waitFor({ state: 'visible' })
  const capturedText = await diagnosticCopy.inputValue()
  assert.match(capturedText, /\[S&SA detection diagnostics\]/, 'Panel did not capture detection diagnostics')
  assert.match(capturedText, /\[S&SA apply checkpoint\]/, 'Panel did not capture Apply checkpoints')
  assert.match(capturedText, /\[S&SA processing checkpoint\]/, 'Panel did not capture processing checkpoints')
  assert.doesNotMatch(capturedText, /data:image|blob:http/, 'Diagnostics included document image data or an object URL')

  const safariFallbackPage = await browser.newPage({ viewport: { width: 390, height: 844 } })
  await safariFallbackPage.addInitScript(() => {
    Object.defineProperty(window, 'createImageBitmap', { configurable: true, value: undefined })
    Object.defineProperty(window, 'OffscreenCanvas', { configurable: true, value: undefined })
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined })
  })
  await safariFallbackPage.goto('http://127.0.0.1:4178/scan?diagnostics=1')
  await safariFallbackPage.locator('input[type="file"][multiple]').setInputFiles(fixture)
  await safariFallbackPage.waitForFunction(() => ['Ready', 'Check the edges'].includes(document.querySelector('.page-status')?.textContent?.trim() ?? ''), undefined, { timeout: 30_000 })
  assert.equal(await safariFallbackPage.locator('.page-status').innerText(), 'Ready', 'HTMLImageElement/canvas fallback did not process the iPhone-style photo')
  await safariFallbackPage.getByRole('button', { name: 'Adjust edges' }).click()
  await safariFallbackPage.getByRole('button', { name: 'Apply', exact: true }).click()
  await safariFallbackPage.locator('.edge-editor').waitFor({ state: 'hidden', timeout: 30_000 })
  assert.equal(await safariFallbackPage.locator('.page-status').innerText(), 'Ready', 'Safari-compatible Apply path did not finish')
  await safariFallbackPage.locator('.diagnostics-panel summary').click()
  await safariFallbackPage.getByRole('button', { name: 'Copy diagnostics' }).click()
  assert.equal(await safariFallbackPage.getByRole('status').innerText(), 'Select the text below and copy it manually.', 'Clipboard fallback was not offered')
  assert.equal(await safariFallbackPage.locator('#scan-diagnostics-copy').evaluate((element) => element.selectionStart === 0 && element.selectionEnd === element.value.length), true, 'Manual-copy fallback did not select the diagnostics')

  const brokenOuterRegression = await page.evaluate(async () => {
    const canvas = document.createElement('canvas'); canvas.width = 1200; canvas.height = 1600
    const context = canvas.getContext('2d')
    context.fillStyle = '#4a4742'; context.fillRect(0, 0, canvas.width, canvas.height)
    context.strokeStyle = '#cbc8bf'; context.lineWidth = 4; context.setLineDash([72, 8]); context.lineJoin = 'round'
    context.beginPath(); context.moveTo(150, 180); context.lineTo(1050, 220); context.lineTo(1000, 1400); context.lineTo(180, 1360); context.closePath(); context.stroke()
    context.setLineDash([]); context.strokeStyle = '#f5f3ed'; context.lineWidth = 8
    context.beginPath(); context.moveTo(330, 440); context.lineTo(850, 450); context.lineTo(830, 1120); context.lineTo(350, 1110); context.closePath(); context.stroke()
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
    const file = new File([blob], 'broken-outer-page.png', { type: 'image/png', lastModified: 1 })
    const { detectDocument } = await import('/src/document-processing/processor.ts')
    const { getDiagnosticEvents } = await import('/src/document-processing/diagnostics.ts')
    await detectDocument(file, { pageId: 'broken-outer-page', documentId: 'regression', pageIndex: 0, pageNumber: 1 })
    const event = [...getDiagnosticEvents()].reverse().find((entry) => entry.label === '[S&SA detection diagnostics]' && entry.payload.identity.pageId === 'broken-outer-page')
    return event.payload
  })
  const standardInternalCandidates = brokenOuterRegression.candidates.filter((candidate) => ['light-contour', 'edge-contour'].includes(candidate.method) && candidate.areaRatio > .12 && candidate.areaRatio < .35)
  const bridgedOuterCandidates = brokenOuterRegression.candidates.filter((candidate) => candidate.method === 'edge-bridged-contour' && candidate.areaRatio > .45)
  assert.ok(standardInternalCandidates.length > 0, 'Regression no longer demonstrates the pre-existing internal quadrilateral')
  assert.ok(bridgedOuterCandidates.length > 0, 'Bridged-edge generation did not propose the weak outer page boundary')
  assert.ok(brokenOuterRegression.candidates.some((candidate) => candidate.areaRatio < .35) && brokenOuterRegression.candidates.some((candidate) => candidate.areaRatio > .45), 'Candidate pool did not retain both internal and outer interpretations')

  console.log(JSON.stringify({ status: await page.locator('.page-status').innerText(), corners, area, apply: 'passed', fourCornerTouchDrag: 'passed', selectionProtection: 'passed', safariFallback: 'passed', brokenOuterRegression: { standardInternalCandidates: standardInternalCandidates.map((candidate) => ({ method: candidate.method, areaRatio: candidate.areaRatio })), bridgedOuterCandidates: bridgedOuterCandidates.map((candidate) => ({ method: candidate.method, areaRatio: candidate.areaRatio })) }, diagnosticEvents: diagnostics.length, timing }, null, 2))
} finally {
  await browser.close()
  await server.close()
}
