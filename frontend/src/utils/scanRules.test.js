import test from 'node:test'
import assert from 'node:assert/strict'
import { scanRuleError } from './scanRules.js'

test('validates exact length, case-sensitive prefix and suffix with leading zeroes', () => {
  const rule = { length: 6, prefix: '00', suffix: 'AZ' }
  assert.equal(scanRuleError('P6', 0, rule, '0012AZ'), '')
  assert.match(scanRuleError('P6', 1, rule, '001AZ'), /code 2.*manquant/)
  assert.match(scanRuleError('P6', 2, rule, '00122AZ'), /code 3.*en trop/)
  assert.match(scanRuleError('P6', 0, rule, 'AB12AZ'), /commencer par « 00 »/)
  assert.match(scanRuleError('P6', 0, rule, '0012Az'), /finir par « AZ »/)
  assert.match(scanRuleError('P6', 0, rule, ''), /obligatoire/)
})

test('blank conditions accept arbitrary text but not missing scans', () => {
  const rule = { length: null, prefix: '', suffix: '' }
  assert.equal(scanRuleError('P6', 0, rule, '00A/+'), '')
  assert.match(scanRuleError('P6', 0, rule, ' '), /obligatoire/)
  assert.match(scanRuleError('P6', 0, rule, 'X'.repeat(101)), /100 caractères/)
})
