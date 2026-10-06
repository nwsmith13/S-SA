import assert from 'node:assert/strict'
import { chromium } from 'playwright-core'
import { createServer } from 'vite'

const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const server = await createServer({ logLevel: 'error', server: { host: '127.0.0.1', port: 4181, strictPort: true } })
await server.listen()
const browser = await chromium.launch({ executablePath: edgePath, headless: true })

try {
  const page = await browser.newPage()
  await page.goto('http://127.0.0.1:4181/')
  const result = await page.evaluate(async () => {
    const { normalizeOpenCvImport } = await import('/src/document-processing/opencv-loader.ts')

    const safariShape = Object.create(Promise.prototype)
    safariShape.Mat = function Mat() {}
    safariShape.onRuntimeInitialized = undefined
    Object.preventExtensions(safariShape)
    let legacyError = null
    try {
      // This is the old loader expression. The object passes instanceof Promise but
      // lacks the internal native-Promise slots required by Promise.prototype.then.
      await (safariShape instanceof Promise ? safariShape : safariShape)
    } catch (error) {
      legacyError = { name: error.name, message: error.message }
    }
    let previousNormalizerError = null
    try {
      Object.defineProperty(safariShape, 'then', { configurable: true, value: undefined })
    } catch (error) {
      previousNormalizerError = { name: error.name, message: error.message }
    }

    const normalizedSafariShape = (await normalizeOpenCvImport({ default: safariShape })).cv
    const synchronous = { Mat: function Mat() {} }
    const normalizedSynchronous = (await normalizeOpenCvImport({ default: synchronous })).cv
    const promised = { Mat: function Mat() {} }
    const normalizedPromise = (await normalizeOpenCvImport({ default: Promise.resolve(promised) })).cv
    const moduleExportsRuntime = { Mat: function Mat() {} }
    const normalizedModuleExports = (await normalizeOpenCvImport({ 'module.exports': moduleExportsRuntime })).cv
    const callbackRuntime = { onRuntimeInitialized: null }
    const callbackResult = normalizeOpenCvImport({ default: callbackRuntime })
    setTimeout(() => {
      callbackRuntime.Mat = function Mat() {}
      callbackRuntime.onRuntimeInitialized()
    }, 0)
    const normalizedCallback = (await callbackResult).cv

    return {
      legacyError,
      previousNormalizerError,
      safariMatType: typeof normalizedSafariShape.Mat,
      safariThenType: typeof normalizedSafariShape.then,
      synchronousIdentity: normalizedSynchronous === synchronous,
      promiseIdentity: normalizedPromise === promised,
      moduleExportsIdentity: normalizedModuleExports === moduleExportsRuntime,
      callbackIdentity: normalizedCallback === callbackRuntime,
    }
  })

  assert.equal(result.legacyError?.name, 'TypeError', 'Safari-shaped Promise impostor did not reproduce the old loader failure')
  assert.equal(result.previousNormalizerError?.name, 'TypeError', 'Previous then-neutralization strategy unexpectedly accepted the non-extensible Safari shape')
  assert.equal(result.safariMatType, 'function', 'Safari-shaped ready runtime did not normalize')
  assert.equal(result.safariThenType, 'function', 'Regression shape no longer carries the unsafe inherited then')
  assert.equal(result.synchronousIdentity, true, 'Synchronous OpenCV export was not preserved')
  assert.equal(result.promiseIdentity, true, 'Genuine Promise-shaped OpenCV export was not resolved')
  assert.equal(result.moduleExportsIdentity, true, 'module.exports OpenCV runtime was not selected')
  assert.equal(result.callbackIdentity, true, 'Runtime callback OpenCV export was not resolved')
  console.log(JSON.stringify(result, null, 2))
} finally {
  await browser.close()
  await server.close()
}
