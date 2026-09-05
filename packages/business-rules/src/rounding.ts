/**
 * Rounds a number to a specific number of decimal places (default: 2 decimals for currency).
 * Standardized to prevent floating point drift across Web and Mobile.
 */
export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Rounds inventory quantity to 4 decimal places.
 */
export function roundQuantity(value: number): number {
  return Math.round((value + Number.EPSILON) * 10000) / 10000;
}
