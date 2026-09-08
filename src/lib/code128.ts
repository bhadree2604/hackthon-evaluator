/**
 * Code 128 (subset B) encoder.
 *
 * Team badges carry the team code twice: as a QR, and as a linear barcode for
 * the handheld scanners at the desk. Subset B covers every printable ASCII
 * character, which is all a team code like `HF3-CATA-4383` needs.
 *
 * The output is a list of alternating bar/space widths in modules, starting
 * with a bar. The renderer decides how wide a module is on screen.
 */

/**
 * The 107 Code 128 symbols. Each is six element widths that add up to 11
 * modules; the stop symbol is the exception at seven elements and 13 modules.
 * `assertPatternTable` below checks exactly that at module load in dev.
 */
const PATTERNS = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312',
  '132212', '221213', '221312', '231212', '112232', '122132', '122231', '113222',
  '123122', '123221', '223211', '221132', '221231', '213212', '223112', '312131',
  '311222', '321122', '321221', '312212', '322112', '322211', '212123', '212321',
  '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121',
  '313121', '211331', '231131', '213113', '213311', '213131', '311123', '311321',
  '331121', '312113', '312311', '332111', '314111', '221411', '431111', '111224',
  '111422', '121124', '121421', '141122', '141221', '112214', '112412', '122114',
  '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112',
  '421211', '212141', '214121', '412121', '111143', '111341', '131141', '114113',
  '114311', '411113', '411311', '113141', '114131', '311141', '411131', '211412',
  '211214', '211232', '2331112',
];

const START_B = 104;
const STOP = 106;

/** Lowest and highest character subset B can carry. */
const MIN_CHAR = 32;
const MAX_CHAR = 126;

export type Code128 = {
  /** Alternating bar/space widths in modules, starting with a bar. */
  widths: number[];
  /** Total width in modules, quiet zones excluded. */
  modules: number;
  /** The text that was actually encoded, after unsupported characters were dropped. */
  text: string;
};

/**
 * Subset B cannot carry anything outside printable ASCII, so those characters
 * are dropped rather than silently encoded as something else. Team codes are
 * upper case on the badge, so the input is upper cased to match.
 */
export function sanitizeForCode128(input: string) {
  let out = '';
  for (const char of input.trim().toUpperCase()) {
    const code = char.charCodeAt(0);
    if (code >= MIN_CHAR && code <= MAX_CHAR) out += char;
  }
  return out;
}

export function encodeCode128(input: string): Code128 {
  const text = sanitizeForCode128(input);
  if (!text) return { widths: [], modules: 0, text: '' };

  const symbols: number[] = [START_B];
  for (const char of text) symbols.push(char.charCodeAt(0) - MIN_CHAR);

  /**
   * Checksum: the start symbol plus every data symbol multiplied by its
   * one-based position, modulo 103.
   */
  let checksum = START_B;
  for (let i = 1; i < symbols.length; i++) {
    checksum += symbols[i] * i;
  }
  symbols.push(checksum % 103);
  symbols.push(STOP);

  const widths: number[] = [];
  for (const symbol of symbols) {
    for (const width of PATTERNS[symbol]) widths.push(Number(width));
  }

  return {
    widths,
    modules: widths.reduce((sum, width) => sum + width, 0),
    text,
  };
}

/**
 * Structural check on the pattern table: a single mistyped digit changes a
 * symbol's module count, which is exactly what this catches. Exported so the
 * check can also run as a test rather than only on import.
 */
export function assertPatternTable() {
  const problems: string[] = [];

  PATTERNS.forEach((pattern, index) => {
    const expectedElements = index === STOP ? 7 : 6;
    const expectedModules = index === STOP ? 13 : 11;
    const modules = pattern.split('').reduce((sum, digit) => sum + Number(digit), 0);

    if (pattern.length !== expectedElements) {
      problems.push(`symbol ${index}: ${pattern.length} elements, expected ${expectedElements}`);
    }
    if (modules !== expectedModules) {
      problems.push(`symbol ${index}: ${modules} modules, expected ${expectedModules}`);
    }
  });

  if (PATTERNS.length !== 107) {
    problems.push(`table has ${PATTERNS.length} symbols, expected 107`);
  }
  return problems;
}

if (__DEV__) {
  const problems = assertPatternTable();
  if (problems.length > 0) {
    console.warn('[code128] pattern table is malformed:', problems.join('; '));
  }
}
