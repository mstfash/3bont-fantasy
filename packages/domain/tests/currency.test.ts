import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  currencyAmountToMinor,
  currencyMinorToDecimal,
} from '../src/currency.ts';
void test('currency precision is explicit and decimal parsing never rounds money', () => {
  assert.equal(currencyAmountToMinor('123.45', 'EUR'), 12345);
  assert.equal(currencyMinorToDecimal(12345, 'EUR'), '123.45');
  assert.equal(currencyAmountToMinor('123', 'JPY'), 123);
  assert.equal(currencyMinorToDecimal(123, 'JPY'), '123');
  assert.equal(currencyAmountToMinor('1.234', 'KWD'), 1234);
  assert.throws(() => currencyAmountToMinor('1.234', 'EUR'));
  assert.throws(() => currencyAmountToMinor('-1', 'EUR'));
  assert.throws(() => currencyAmountToMinor('9007199254740992', 'JPY'));
});
