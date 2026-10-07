/**
 * Number helpers that reproduce Python's and NumPy's rounding and formatting
 * exactly, so the browser agenda prints the same figures, to the cent, as the
 * Python generator it replaces (backend/agenda/).
 *
 * Why not plain toFixed/Math.round: JavaScript rounds an exact tie (1.25 to one
 * decimal) away from zero, Python rounds it to even ("1.2"). Ties are rare but
 * real in RM amounts that are multiples of 1/8, and a message reading "1.3k"
 * where the old tool said "1.2k" would look like a bug to the manager.
 */

/** Exact-tie check for rounding `x` to `n` decimals.
 *
 * A decimal tie (…5 at the n+1th place) is only representable in binary when
 * x is a multiple of 1/2^(n+1), and multiplying by a power of two is exact, so
 * this test cannot be fooled by a value that merely prints like a tie
 * (2.675 is really 2.67499999…, and is not one).
 */
function isExactTie(x: number, n: number): boolean {
  if (!Number.isInteger(x * 2 ** (n + 1))) return false;
  const scaled = x * 10 ** n; // exact here: x = j / 2^(n+1)
  return Math.abs(scaled - Math.trunc(scaled)) === 0.5;
}

/** Python's `f"{x:.{n}f}"` (no thousands separator). Keeps the sign of -0.0. */
export function pyFixed(x: number, n: number): string {
  const negative = x < 0 || Object.is(x, -0);
  const a = Math.abs(x);
  let body: string;
  if (isExactTie(a, n)) {
    // Round half to even on the exact value.
    const scaled = a * 10 ** n;
    const lower = Math.floor(scaled);
    const even = lower % 2 === 0 ? lower : lower + 1;
    body = (even / 10 ** n).toFixed(n);
  } else {
    body = a.toFixed(n);
  }
  return (negative ? '-' : '') + body;
}

/** Python's built-in `round(x, n)` on a float. */
export function pyRound(x: number, n = 0): number {
  return Number(pyFixed(x, n));
}

/** Python's `f"{x:,.{n}f}"`. */
export function pyComma(x: number, n: number): string {
  const s = pyFixed(x, n);
  const negative = s.startsWith('-');
  const [int, frac] = (negative ? s.slice(1) : s).split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return (negative ? '-' : '') + grouped + (frac !== undefined ? `.${frac}` : '');
}

/** NumPy's `rint`: round half to even on the float as given. */
function rint(y: number): number {
  const f = Math.floor(y);
  const d = y - f;
  if (d < 0.5) return f;
  if (d > 0.5) return f + 1;
  return f % 2 === 0 ? f : f + 1;
}

/** pandas `Series.round(n)` (NumPy `around`): rint(x * 10^n) / 10^n. */
export function npRound(x: number, n: number): number {
  const p = 10 ** n;
  return rint(x * p) / p;
}

const PW_BLOCKSIZE = 128;

function pairwise(a: number[], start: number, n: number): number {
  if (n < 8) {
    let res = 0;
    for (let i = 0; i < n; i++) res += a[start + i];
    return res;
  }
  if (n <= PW_BLOCKSIZE) {
    const r = [
      a[start], a[start + 1], a[start + 2], a[start + 3],
      a[start + 4], a[start + 5], a[start + 6], a[start + 7],
    ];
    let i = 8;
    for (; i < n - (n % 8); i += 8) {
      for (let j = 0; j < 8; j++) r[j] += a[start + i + j];
    }
    let res = ((r[0] + r[1]) + (r[2] + r[3])) + ((r[4] + r[5]) + (r[6] + r[7]));
    for (; i < n; i++) res += a[start + i];
    return res;
  }
  let n2 = Math.floor(n / 2);
  n2 -= n2 % 8;
  return pairwise(a, start, n2) + pairwise(a, start + n2, n - n2);
}

/**
 * pandas `Series.sum()` on float64: missing values count as 0, and the total
 * uses NumPy's pairwise summation in row order. Summing the same rows in the
 * same order the same way is what keeps every cent identical to the Python
 * tool, rather than merely close to it.
 */
export function pandasSum(values: number[]): number {
  const filled = values.map((v) => (Number.isNaN(v) ? 0 : v));
  return 0 + pairwise(filled, 0, filled.length);
}
