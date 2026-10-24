/** True for a string with at least one character; the API sends empty strings as well as missing values. */
export function isNonEmptyString(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.length > 0;
}

/** True for a finite number, as opposed to undefined, NaN or Infinity. */
export function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** True when two lists hold the same items in the same order; for signals whose value is a fresh array. */
export function sameItems<T>(first: readonly T[], second: readonly T[]): boolean {
  return first.length === second.length && first.every((item, index) => item === second[index]);
}
