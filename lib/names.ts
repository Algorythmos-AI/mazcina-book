/**
 * Spotting the same thing typed twice: "Lemon" and "Lemons", "Chilli" and
 * "Chili", "Olive  oil" and "olive oil". Two names for one ingredient split
 * its prices and stock, so a near match is pointed out before a new one is made.
 */

function singular(word: string): string {
  if (word.length <= 3) return word;
  if (word.endsWith('ies')) return `${word.slice(0, -3)}y`;
  if (/(oes|ches|shes|sses|xes|zes)$/.test(word)) return word.slice(0, -2);
  if (word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
  return word;
}

/** Lower case, single spaces, no punctuation, each word made singular. */
export function nameKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map(singular)
    .join(' ');
}

function editDistance(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 1) return 2;
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let previous = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const current = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
      previous = current;
    }
  }
  return row[b.length];
}

/** Existing names that are probably the same thing as `name`, closest first. Never `name` itself. */
export function nearMatches(name: string, existing: string[]): string[] {
  const key = nameKey(name);
  if (!key) return [];
  const exact = name.trim().toLowerCase();
  return existing.filter((other) => {
    if (other.trim().toLowerCase() === exact) return false;
    const otherKey = nameKey(other);
    if (otherKey === key) return true;
    // One letter out (a typo) only counts for longer names: "Basil" and "Basin" are both fine to have.
    return key.length >= 6 && editDistance(key, otherKey) <= 1;
  });
}
