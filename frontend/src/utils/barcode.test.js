import test from 'node:test'
import assert from 'node:assert/strict'
import { checkedBarcodeLookup } from './barcode.js'

test('accepts a complete code unchanged, including letters, slashes and leading zeroes', async () => {
  const original = globalThis.window
  globalThis.window = { dispatchEvent: () => assert.fail('Valid scan must not open popup') }
  try {
    const result = await checkedBarcodeLookup('0012/AB34', async code => {
      assert.equal(code, '0012/AB34')
      return { pdef: code }
    })
    assert.deepEqual(result, { pdef: '0012/AB34' })
  } finally {
    globalThis.window = original
  }
})

test('opens exactly one error popup and blocks empty, truncated, extended or unreadable scans', async () => {
  const original = globalThis.window
  const alerts = []
  globalThis.window = { dispatchEvent: event => alerts.push(event.detail) }
  try {
    for (const code of ['', ' ', '123', '1234567890129', '123*56789012']) {
      const error = { response: { data: { error: 'Code-barres erroné : référence complète requise.' } } }
      await assert.rejects(checkedBarcodeLookup(code, async () => { throw error }))
    }
    assert.equal(alerts.length, 5)
    assert.ok(alerts.every(error => error.message.startsWith('Code-barres erroné')))
    assert.equal(alerts[2].barcode, '123')
    await assert.rejects(checkedBarcodeLookup('unknown', async () => ({ found: false })))
    assert.equal(alerts.length, 6)
  } finally {
    globalThis.window = original
  }
})

test('surfaces network failures without claiming that the barcode is wrong', async () => {
  const original = globalThis.window
  globalThis.window = { dispatchEvent: () => assert.fail('Network error is not a barcode error') }
  try {
    await assert.rejects(checkedBarcodeLookup('123456789012', async () => { throw new Error('Network unavailable') }),
      /Network unavailable/)
  } finally {
    globalThis.window = original
  }
})

test('server-side complementary errors show the failing scan, not the main barcode', async () => {
  const original = globalThis.window
  const alerts = []
  globalThis.window = { dispatchEvent: event => alerts.push(event.detail) }
  try {
    await assert.rejects(checkedBarcodeLookup('MAIN', async () => {
      throw new Error('Code-barres erroné : projet P6, code 2. Le code doit finir par « 9 ».')
    }, ['MAIN', 'B/+8']))
    assert.equal(alerts[0].barcode, 'B/+8')
  } finally {
    globalThis.window = original
  }
})
