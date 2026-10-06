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
    if (message.text().startsWith('[S&SA detection diagnostics]') || message.text().startsWith('[S&SA processing diagnostics]')) diagnostics.push(message.text())
  })
  await page.goto('http://127.0.0.1:4178/scan')
  await page.locator('input[type="file"][multiple]').setInputFiles(fixture)
  await page.locator('.page-status').waitFor({ state: 'visible', timeout: 30_000 })
  await page.waitForFunction(() => ['Ready', 'Check the edges'].includes(document.querySelector('.page-status')?.textContent?.trim() ?? ''), undefined, { timeout: 30_000 })

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

  const expectedForeground = [{ x: .10, y: .18 }, { x: .80, y: .18 }, { x: .83, y: .84 }, { x: .09, y: .84 }]
  const distances = corners.map((point, index) => Math.hypot(point.x - expectedForeground[index].x, point.y - expectedForeground[index].y))
  assert.ok(distances.reduce((sum, value) => sum + value, 0) / distances.length < .09, `Candidate does not approximate the foreground document: ${JSON.stringify(corners)}`)
  assert.ok(distances.filter((value) => value < .08).length >= 3, 'Fewer than three corners are close to the foreground document')

  const processedBefore = await page.getByRole('button', { name: 'Review page 1' }).locator('img').getAttribute('src')
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

  const safariFallbackPage = await browser.newPage({ viewport: { width: 390, height: 844 } })
  await safariFallbackPage.addInitScript(() => {
    Object.defineProperty(window, 'createImageBitmap', { configurable: true, value: undefined })
    Object.defineProperty(window, 'OffscreenCanvas', { configurable: true, value: undefined })
  })
  await safariFallbackPage.goto('http://127.0.0.1:4178/scan')
  await safariFallbackPage.locator('input[type="file"][multiple]').setInputFiles(fixture)
  await safariFallbackPage.waitForFunction(() => ['Ready', 'Check the edges'].includes(document.querySelector('.page-status')?.textContent?.trim() ?? ''), undefined, { timeout: 30_000 })
  assert.equal(await safariFallbackPage.locator('.page-status').innerText(), 'Ready', 'HTMLImageElement/canvas fallback did not process the iPhone-style photo')
  await safariFallbackPage.getByRole('button', { name: 'Adjust edges' }).click()
  await safariFallbackPage.getByRole('button', { name: 'Apply', exact: true }).click()
  await safariFallbackPage.locator('.edge-editor').waitFor({ state: 'hidden', timeout: 30_000 })
  assert.equal(await safariFallbackPage.locator('.page-status').innerText(), 'Ready', 'Safari-compatible Apply path did not finish')

  console.log(JSON.stringify({ status: await page.locator('.page-status').innerText(), corners, area, apply: 'passed', fourCornerTouchDrag: 'passed', selectionProtection: 'passed', safariFallback: 'passed', diagnosticEvents: diagnostics.length, timing }, null, 2))
} finally {
  await browser.close()
  await server.close()
}
