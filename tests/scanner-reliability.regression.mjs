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
    const { assessCandidateQuality, classifyContourArea, findIndependentAgreement, selectCandidateByQuality, shouldAutoApplyCandidate } = await import('/src/document-processing/candidate-quality.ts')
    const { commitPageProcessingResult } = await import('/src/document-processing/page-identity.ts')
    const { compareCandidateStructures } = await import('/src/document-processing/candidate-structure-diagnostics.ts')
    const { describeGeometry, describeGeometryTransition } = await import('/src/document-processing/geometry-diagnostics.ts')

    const normal = assessCandidateQuality([
      { x: .275, y: .05 }, { x: .725, y: .05 }, { x: .725, y: .95 }, { x: .275, y: .95 },
    ], .968)
    const angled = assessCandidateQuality([
      { x: .20, y: .20 }, { x: .65, y: .10 }, { x: .75, y: .67 }, { x: .27, y: .78 },
    ], .894)
    const borderHugging = assessCandidateQuality([
      { x: 0, y: .113 }, { x: .995, y: .007 }, { x: .988, y: .849 }, { x: .123, y: .831 },
    ], .841)
    const twoSideBoundaryPoints = [
      { x: .039, y: .112 }, { x: .999, y: .003 }, { x: .999, y: .820 }, { x: .218, y: .808 },
    ]
    const twoSideBoundary = assessCandidateQuality(twoSideBoundaryPoints, .848)
    const correctedInterior = [
      { x: .098, y: .176 }, { x: .644, y: .130 }, { x: .708, y: .677 }, { x: .182, y: .677 },
    ]
    const ranked = selectCandidateByQuality([
      { points: twoSideBoundaryPoints, score: .848 },
      { points: correctedInterior, score: .81 },
    ])
    const clippedPoints = [
      { x: .108, y: 0 }, { x: .998, y: .135 }, { x: .951, y: .802 }, { x: .039, y: .792 },
    ]
    const clipped = assessCandidateQuality(clippedPoints, .878)
    const clippedLoneAgreement = findIndependentAgreement(0, [{ points: clippedPoints, method: 'light-contour' }])
    const clippedCorroboratedAgreement = findIndependentAgreement(0, [
      { points: clippedPoints, method: 'light-contour' },
      { points: clippedPoints.map((point, index) => ({ x: point.x + (index % 2 ? -.004 : .003), y: point.y + .002 })), method: 'edge-contour' },
    ])
    const physicalBase = [
      { x: .15, y: .15 }, { x: .75, y: .15 }, { x: .75, y: .80 }, { x: .15, y: .80 },
    ]
    const physicalCorroborated = findIndependentAgreement(0, [
      { points: physicalBase, method: 'light-contour', score: .940, viable: true },
      { points: physicalBase.map((point, index) => ({ x: point.x + [.0003, .0005, .00066, .00104][index], y: point.y })), method: 'edge-contour', score: .91, viable: true },
    ])
    const physicalConflict = findIndependentAgreement(0, [
      { points: physicalBase, method: 'edge-contour', score: .922, viable: true },
      { points: [{ x: .23, y: .15 }, { x: .75, y: .30 }, { x: .496, y: .80 }, { x: .15, y: .612 }], method: 'light-contour', score: .87, viable: true },
    ])
    const singleMethod = findIndependentAgreement(0, [{ points: physicalBase, method: 'edge-contour', score: .922, viable: true }])
    const physicalAssessment = assessCandidateQuality(physicalBase)
    const physicalDecisions = {
      corroborated: shouldAutoApplyCandidate(physicalAssessment, physicalCorroborated),
      conflicting: shouldAutoApplyCandidate(physicalAssessment, physicalConflict),
      singleMethod: shouldAutoApplyCandidate(physicalAssessment, singleMethod),
    }
    const distantDocument = [
      { x: .36, y: .30 }, { x: .61, y: .30 }, { x: .61, y: .61 }, { x: .36, y: .61 },
    ]
    const distantQuality = assessCandidateQuality(distantDocument, .74)
    const distantCorroborated = findIndependentAgreement(0, [
      { points: distantDocument, method: 'light-contour', score: .74, viable: true },
      { points: distantDocument.map((point, index) => ({ x: point.x + (index % 2 ? .002 : -.001), y: point.y + .001 })), method: 'edge-contour', score: .71, viable: true },
    ])
    const distantSingleMethod = findIndependentAgreement(0, [{ points: distantDocument, method: 'light-contour', score: .74, viable: true }])
    const thinNoise = assessCandidateQuality([
      { x: .20, y: .40 }, { x: .80, y: .40 }, { x: .80, y: .50 }, { x: .20, y: .50 },
    ], .78)
    const tinyNoise = assessCandidateQuality([
      { x: .20, y: .20 }, { x: .35, y: .20 }, { x: .35, y: .35 }, { x: .20, y: .35 },
    ], .8)
    const distantDecisions = {
      contour077: classifyContourArea(.077197),
      contour078: classifyContourArea(.077846),
      contourNoise: classifyContourArea(.02),
      corroborated: shouldAutoApplyCandidate(distantQuality, distantCorroborated),
      singleMethod: shouldAutoApplyCandidate(distantQuality, distantSingleMethod),
    }
    const canonical = [{ x: .18, y: .14 }, { x: .76, y: .16 }, { x: .72, y: .70 }, { x: .178, y: .703 }]
    const raw = [canonical[2], canonical[3], canonical[0], canonical[1]]
    const rawGeometry = describeGeometry(raw, 'raw')
    const canonicalization = describeGeometryTransition(raw, canonical, 'raw', 'canonical')
    const structuralComparison = compareCandidateStructures(
      { method: 'light-contour', score: .86, points: canonical }, 2,
      { method: 'edge-contour', score: .84, points: [{ x: .18, y: .14 }, { x: .76, y: .16 }, { x: .72, y: .70 }, { x: .097, y: .961 }] }, 5,
    )

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
    let sharedTokenDocuments = [{ id: 'document-shared', pages: [
      { id: 'page-m', processingToken: 'shared-token', processedUrl: 'm-original' },
      { id: 'page-n', processingToken: 'shared-token', processedUrl: 'n-original' },
    ] }]
    sharedTokenDocuments = commitPageProcessingResult(sharedTokenDocuments, 'page-m', 'shared-token', (page) => ({ ...page, processedUrl: 'm-result' }))

    return { normal, angled, borderHugging, twoSideBoundary, ranked, clipped, clippedLoneAgreement, clippedCorroboratedAgreement, physicalCorroborated, physicalConflict, singleMethod, physicalDecisions, distantQuality, distantCorroborated, distantSingleMethod, distantDecisions, thinNoise, tinyNoise, rawGeometry, canonicalization, structuralComparison, pages: documents[0].pages, sharedTokenPages: sharedTokenDocuments[0].pages }
  })

  assert.equal(result.normal.accepted, true, '0.968 / 0.405 normal candidate was rejected')
  assert.ok(Math.abs(result.normal.areaRatio - .405) < .001, 'Normal candidate fixture area changed')
  assert.equal(result.angled.accepted, true, '0.894 / 0.270 angled candidate was rejected')
  assert.ok(Math.abs(result.angled.areaRatio - .27) < .01, 'Angled candidate fixture area changed')
  assert.equal(result.borderHugging.accepted, false, '0.841 / 0.728 border-hugging candidate was accepted')
  assert.ok(result.borderHugging.reasons.includes('large-region-with-three-border-corners'))
  assert.equal(result.twoSideBoundary.accepted, false, '0.848 / 0.663 two-side boundary candidate was accepted')
  assert.equal(result.twoSideBoundary.boundaryFollowingEdges[0]?.side, 'right', 'Right edge was not recognized as following the image boundary')
  assert.ok(result.twoSideBoundary.reasons.includes('large-region-with-edge-following-image-boundary'))
  assert.equal(result.ranked.selectedIndex, 1, 'Rejected boundary candidate outranked a plausible interior candidate')
  assert.equal(result.clipped.accepted, true, 'Partially clipped candidate was rejected rather than confidence-gated')
  assert.equal(result.clipped.requiresIndependentAgreement, true, 'Large two-side candidate did not require independent agreement')
  assert.equal(result.clippedLoneAgreement.corroborated, false, 'Lone light candidate was incorrectly corroborated')
  assert.equal(result.clippedCorroboratedAgreement.corroborated, true, 'Matching light and edge candidates were not recognized as corroborating')
  assert.equal(result.physicalCorroborated.corroborated, true, 'Physical 0.940 near-identical light/edge case lost corroboration')
  assert.ok(Math.abs(result.physicalCorroborated.meanCornerDistance - .000625) < .000001, 'Corroborated physical-case mean distance changed')
  assert.ok(Math.abs(result.physicalCorroborated.maximumCornerDistance - .00104) < .000001, 'Corroborated physical-case maximum distance changed')
  assert.equal(result.physicalConflict.materialConflict, true, 'Physical 0.922 disagreement was not treated as a material conflict')
  assert.ok(Math.abs(result.physicalConflict.meanCornerDistance - .168) < .000001, 'Conflicting physical-case mean distance changed')
  assert.ok(Math.abs(result.physicalConflict.maximumCornerDistance - .254) < .000001, 'Conflicting physical-case maximum distance changed')
  assert.equal(result.singleMethod.independentCandidateFound, false, 'Single-method detection was incorrectly treated as a conflict')
  assert.equal(result.physicalDecisions.corroborated, true, 'Corroborated physical case should remain eligible for automatic application')
  assert.equal(result.physicalDecisions.conflicting, false, 'Conflicting physical case should require Adjust Edges')
  assert.equal(result.physicalDecisions.singleMethod, true, 'A sound single-method detection should retain an automatic path')
  assert.equal(result.distantDecisions.contour077, 'small-document', '7.7197% contour did not enter the bounded small-document path')
  assert.equal(result.distantDecisions.contour078, 'small-document', '7.7846% contour did not enter the bounded small-document path')
  assert.equal(result.distantDecisions.contourNoise, 'reject', '2% noise contour entered candidate evaluation')
  assert.ok(result.distantQuality.areaRatio > .07 && result.distantQuality.areaRatio < .08, 'Distant-document fixture is outside the physical diagnostic area range')
  assert.equal(result.distantQuality.accepted, true, 'Plausible distant document failed geometric prequalification')
  assert.equal(result.distantQuality.requiresIndependentAgreement, true, 'Small document did not require independent-method evidence')
  assert.equal(result.distantDecisions.corroborated, true, 'Corroborated small document should be eligible for auto-apply')
  assert.equal(result.distantDecisions.singleMethod, false, 'Single-method small document should require manual review')
  assert.equal(result.thinNoise.accepted, false, 'Thin small noise passed geometric prequalification')
  assert.ok(result.thinNoise.reasons.includes('small-region-with-implausible-edge-balance'))
  assert.equal(result.tinyNoise.accepted, false, 'Sub-4% noise passed candidate quality')
  assert.ok(result.tinyNoise.reasons.includes('candidate-too-small'))
  assert.deepEqual(result.rawGeometry.corners.map((corner) => corner.label), ['P0', 'P1', 'P2', 'P3'])
  assert.equal(result.canonicalization.cornerOrderChanged, true, 'Raw detector permutation was not exposed')
  assert.equal(result.canonicalization.coordinatesChanged, false, 'Pure canonicalization was incorrectly reported as a coordinate change')
  assert.deepEqual(result.structuralComparison.candidateA, { index: 2, method: 'light-contour', score: .86 })
  assert.deepEqual(result.structuralComparison.candidateB, { index: 5, method: 'edge-contour', score: .84 })
  assert.equal(result.structuralComparison.bestCornerCorrespondence.length, 4)
  assert.ok(result.structuralComparison.sharedCornerCount >= 3)
  assert.ok(result.structuralComparison.sharedEdgeCount >= 2)
  assert.equal(result.structuralComparison.extensionRelationship.sameStructureLikely, true)
  assert.equal(result.structuralComparison.extensionRelationship.extendedCandidate, 'B')
  assert.ok(result.structuralComparison.extensionRelationship.extensionSides.includes('bottom'))
  assert.deepEqual(result.pages, [{ id: 'page-a', processingToken: 'a-new', processedUrl: 'a-result' }], 'Out-of-order processing crossed stable page identity')
  assert.deepEqual(result.sharedTokenPages, [
    { id: 'page-m', processingToken: 'shared-token', processedUrl: 'm-result' },
    { id: 'page-n', processingToken: 'shared-token', processedUrl: 'n-original' },
  ], 'A matching token allowed one page result to overwrite another page ID')
  console.log(JSON.stringify(result, null, 2))
} finally {
  await browser.close()
  await server.close()
}
