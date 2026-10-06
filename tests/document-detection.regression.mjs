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

const server = await createServer({ root: projectRoot, logLevel: 'error', server: { host: '127.0.0.1', port: 4178, strictPort: true } })
await server.listen()
const browser = await chromium.launch({ executablePath: edgePath, headless: true })

try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
  page.on('console', (message) => {
    if (message.text().startsWith('[S&SA scan timing]')) timing.push(message.text())
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

  const expectedForeground = [{ x: .10, y: .18 }, { x: .80, y: .18 }, { x: .83, y: .84 }, { x: .09, y: .84 }]
  const distances = corners.map((point, index) => Math.hypot(point.x - expectedForeground[index].x, point.y - expectedForeground[index].y))
  assert.ok(distances.reduce((sum, value) => sum + value, 0) / distances.length < .09, `Candidate does not approximate the foreground document: ${JSON.stringify(corners)}`)
  assert.ok(distances.filter((value) => value < .08).length >= 3, 'Fewer than three corners are close to the foreground document')

  const processedBefore = await page.getByRole('button', { name: 'Review page 1' }).locator('img').getAttribute('src')
  const firstHandle = page.locator('.corner-handle').first()
  const box = await firstHandle.boundingBox()
  assert.ok(box, 'First corner handle has no visible bounds')
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + 14, box.y + box.height / 2 + 10, { steps: 4 })
  await page.mouse.up()
  const manualPosition = await firstHandle.getAttribute('style')

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

  console.log(JSON.stringify({ status: await page.locator('.page-status').innerText(), corners, area, apply: 'passed', safariFallback: 'passed', timing }, null, 2))
} finally {
  await browser.close()
  await server.close()
}
