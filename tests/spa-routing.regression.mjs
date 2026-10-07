import assert from 'node:assert/strict'
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const testDirectory = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(testDirectory, '..')
const dist = path.join(projectRoot, 'dist')
const configuration = JSON.parse(readFileSync(path.join(projectRoot, 'vercel.json'), 'utf8'))
const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'

assert.deepEqual(configuration.routes?.[0], { handle: 'filesystem' }, 'Static files must be resolved before the SPA fallback')
assert.deepEqual(configuration.routes?.[1], { src: '/.*', dest: '/index.html' }, 'Missing catch-all SPA route')
assert.ok(existsSync(path.join(dist, 'index.html')), 'Run the production build before this test')

const contentTypes = { '.css': 'text/css', '.html': 'text/html', '.js': 'text/javascript', '.svg': 'image/svg+xml' }
const server = createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://127.0.0.1').pathname)
  const requestedPath = path.resolve(dist, `.${pathname}`)
  const insideDist = requestedPath === dist || requestedPath.startsWith(`${dist}${path.sep}`)
  const staticFile = insideDist && existsSync(requestedPath) && statSync(requestedPath).isFile() ? requestedPath : null
  const servedPath = staticFile ?? path.join(dist, 'index.html')
  response.statusCode = 200
  response.setHeader('content-type', contentTypes[path.extname(servedPath)] ?? 'application/octet-stream')
  createReadStream(servedPath).pipe(response)
})

await new Promise((resolve) => server.listen(4180, '127.0.0.1', resolve))
const browser = await chromium.launch({ executablePath: edgePath, headless: true })

try {
  const base = 'http://127.0.0.1:4180'
  for (const route of ['/', '/scan', '/scan?diagnostics=1', '/cleanup', '/library', '/library/11111111-1111-4111-8111-111111111111', '/account', '/account/reset-password', '/auth/callback']) {
    const response = await fetch(`${base}${route}`, { redirect: 'manual' })
    assert.equal(response.status, 200, `${route} did not resolve`)
    assert.match(response.headers.get('content-type') ?? '', /text\/html/, `${route} did not receive the SPA entry point`)
    assert.match(await response.text(), /<div id="root"><\/div>/, `${route} did not receive index.html`)
  }

  const index = readFileSync(path.join(dist, 'index.html'), 'utf8')
  const assetPath = index.match(/(?:src|href)="(\/assets\/[^"]+)"/)?.[1]
  assert.ok(assetPath, 'Production index did not reference a built asset')
  const assetResponse = await fetch(`${base}${assetPath}`)
  assert.equal(assetResponse.status, 200, 'Built asset did not resolve')
  assert.doesNotMatch(assetResponse.headers.get('content-type') ?? '', /text\/html/, 'Built asset was incorrectly rewritten to index.html')

  const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
  await page.goto(`${base}/scan?diagnostics=1`)
  await page.locator('.diagnostics-panel').waitFor({ state: 'visible' })
  assert.equal(await page.locator('.diagnostics-panel').getAttribute('open'), null, 'Production diagnostics panel must start collapsed')
  assert.equal(await page.getByRole('heading', { name: 'Make paper easier to keep.' }).isVisible(), true, 'Direct /scan request did not render the Scan route')

  await page.reload()
  assert.equal(await page.getByRole('heading', { name: 'Make paper easier to keep.' }).isVisible(), true, 'Refreshing a nested route failed')
  assert.equal(await page.locator('.diagnostics-panel').isVisible(), true, 'Query-enabled diagnostics disappeared after refresh')

  console.log(JSON.stringify({ routes: ['/', '/scan', '/scan?diagnostics=1', '/cleanup', '/library', '/library/:documentId', '/account', '/account/reset-password', '/auth/callback'], nestedRefresh: 'passed', staticAssetPrecedence: 'passed', productionDiagnosticsQuery: 'passed' }, null, 2))
} finally {
  await browser.close()
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
}
