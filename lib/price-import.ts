/**
 * Reads a supplier price list pasted from a spreadsheet, an email or a CSV
 * file. Pure text handling only: matching against the database happens in the
 * server action. Nothing here guesses: a cell it cannot read becomes a row
 * error the chef can see and fix.
 */
import { parseDecimalInput, type Unit } from './costing';

export interface ParsedPriceRow {
  /** 1-based line number in the pasted text, for error messages. */
  line: number;
  ingredient: string;
  supplier: string;
  packSize: string | null;
  packUnit: Unit | null;
  packPrice: string | null;
  gstApplicable: boolean;
  priceIncludesGst: boolean;
  errors: string[];
}

export interface ParsedPriceList {
  rows: ParsedPriceRow[];
  /** A problem with the paste as a whole, e.g. nothing to read. */
  error: string | null;
  /** Worth checking but not blocking, e.g. nothing says which items have GST. */
  warnings: string[];
}

type Column = 'ingredient' | 'supplier' | 'size' | 'unit' | 'price' | 'gst' | 'inc';

const HEADER_NAMES: Record<Column, string[]> = {
  ingredient: ['ingredient', 'item', 'product', 'name', 'description'],
  supplier: ['supplier', 'vendor', 'from'],
  size: ['pack size', 'packsize', 'size', 'qty', 'quantity', 'pack'],
  unit: ['unit', 'uom', 'pack unit'],
  price: ['price', 'pack price', 'cost', 'amount', 'price ex gst', 'price inc gst'],
  gst: ['gst', 'has gst', 'taxable'],
  inc: ['inc gst', 'includes gst', 'price includes gst', 'gst inclusive'],
};

const DEFAULT_ORDER: Column[] = ['ingredient', 'supplier', 'size', 'unit', 'price', 'gst', 'inc'];

const UNIT_WORDS: Record<string, Unit> = {
  g: 'g', gm: 'g', gram: 'g', grams: 'g',
  kg: 'kg', kgs: 'kg', kilo: 'kg', kilos: 'kg',
  ml: 'ml', mls: 'ml',
  l: 'l', lt: 'l', ltr: 'l', litre: 'l', litres: 'l', liter: 'l', liters: 'l',
  each: 'each', ea: 'each', pc: 'each', pcs: 'each', piece: 'each', pieces: 'each', unit: 'each',
};

const YES = new Set(['y', 'yes', 'true', '1', 'x', 'gst', 'inc']);
const NO = new Set(['', 'n', 'no', 'false', '0', '-', 'free', 'ex']);

export const MAX_IMPORT_ROWS = 500;

function splitLine(line: string, delimiter: string): string[] {
  if (delimiter !== ',') return line.split(delimiter).map((c) => c.trim());
  // Comma-separated: honour "quoted, cells".
  const cells: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      cells.push(cell.trim());
      cell = '';
    } else cell += ch;
  }
  cells.push(cell.trim());
  return cells;
}

/** Tabs (pasted from a spreadsheet) win, then semicolons, then commas. */
function detectDelimiter(lines: string[]): string {
  if (lines.some((l) => l.includes('\t'))) return '\t';
  if (lines.every((l) => l.includes(';'))) return ';';
  return ',';
}

function cleanMoney(cell: string): string {
  return cell.replace(/^\$\s*/, '').replace(/\s*(aud|ea|each)$/i, '').trim();
}

function yesNo(cell: string, label: string, errors: string[]): boolean {
  const value = cell.trim().toLowerCase();
  if (YES.has(value)) return true;
  if (NO.has(value)) return false;
  errors.push(`${label}: use yes or no`);
  return false;
}

interface Header {
  columns: Map<Column, number>;
  /** What the price heading says about GST ("Price inc GST" / "Price ex GST"), when it says anything. */
  priceGst: 'inc' | 'ex' | null;
}

function headerMap(cells: string[]): Header | null {
  const map = new Map<Column, number>();
  let priceGst: Header['priceGst'] = null;
  cells.forEach((cell, index) => {
    const name = cell.toLowerCase().replace(/[^a-z ]/g, '').replace(/\s+/g, ' ').trim();
    // Longest names first so "inc gst" is not taken for "gst" and "pack price" for "pack".
    const match = (Object.keys(HEADER_NAMES) as Column[])
      .flatMap((column) => HEADER_NAMES[column].map((alias) => ({ column, alias })))
      .sort((a, b) => b.alias.length - a.alias.length)
      .find(({ alias }) => name === alias);
    if (match && !map.has(match.column)) {
      map.set(match.column, index);
      if (match.alias === 'price inc gst') priceGst = 'inc';
      if (match.alias === 'price ex gst') priceGst = 'ex';
    }
  });
  return map.has('ingredient') && map.has('price') ? { columns: map, priceGst } : null;
}

export function parsePriceList(text: string): ParsedPriceList {
  const lines = text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((content, index) => ({ content, line: index + 1 }))
    .filter((l) => l.content.trim() !== '');
  if (lines.length === 0) return { rows: [], error: 'Paste your price list first', warnings: [] };

  const delimiter = detectDelimiter(lines.map((l) => l.content));
  const header = headerMap(splitLine(lines[0].content, delimiter));
  const columns = header?.columns ?? new Map(DEFAULT_ORDER.map((column, index) => [column, index]));
  // A "Price inc GST" heading answers the Inc GST question for every row that has GST.
  const priceGst = columns.has('inc') ? null : (header?.priceGst ?? null);
  const body = header ? lines.slice(1) : lines;

  if (body.length === 0) return { rows: [], error: 'Only a heading row was found', warnings: [] };
  if (body.length > MAX_IMPORT_ROWS) return { rows: [], error: `Too many rows (${body.length}). Import up to ${MAX_IMPORT_ROWS} at a time.`, warnings: [] };
  let anyGstCell = false;

  const rows = body.map(({ content, line }): ParsedPriceRow => {
    const cells = splitLine(content, delimiter);
    const cell = (column: Column) => {
      const index = columns.get(column);
      return index === undefined ? '' : (cells[index] ?? '');
    };
    const errors: string[] = [];

    const ingredient = cell('ingredient');
    if (!ingredient) errors.push('Ingredient name is missing');
    const supplier = cell('supplier');

    const sizeRaw = cell('size');
    const unitRaw = cell('unit').toLowerCase().replace(/\.$/, '');
    let packSize: string | null = null;
    let packUnit: Unit | null = null;

    // "5kg" or "5 kg" typed in one cell.
    const combined = /^([\d.,]+)\s*([a-z]+)\.?$/i.exec(sizeRaw);
    if (combined && !unitRaw) {
      packSize = parseDecimalInput(combined[1]);
      packUnit = UNIT_WORDS[combined[2].toLowerCase()] ?? null;
      if (!packUnit) errors.push(`Unit "${combined[2]}" is not one of g, kg, ml, l, each`);
    } else {
      // A bare unit with no size means one of that unit: "kg" is 1 kg.
      packSize = sizeRaw ? parseDecimalInput(sizeRaw) : unitRaw ? '1' : null;
      packUnit = UNIT_WORDS[unitRaw] ?? null;
      if (!unitRaw) errors.push('Unit is missing');
      else if (!packUnit) errors.push(`Unit "${cell('unit')}" is not one of g, kg, ml, l, each`);
    }
    if (packSize === null) errors.push(sizeRaw ? `Pack size "${sizeRaw}" is not a clear number` : 'Pack size is missing');
    else if (Number(packSize) <= 0) errors.push('Pack size must be more than zero');

    const priceRaw = cleanMoney(cell('price'));
    const packPrice = priceRaw ? parseDecimalInput(priceRaw) : null;
    if (!priceRaw) errors.push('Price is missing');
    else if (packPrice === null) errors.push(`Price "${cell('price')}" is not a clear number`);
    else if (Number(packPrice) === 0) errors.push('Price is $0. Enter something that costs nothing on its ingredient page instead.');

    if (cell('gst').trim() !== '') anyGstCell = true;
    const gstApplicable = yesNo(cell('gst'), 'GST', errors);
    const priceIncludesGst = priceGst ? priceGst === 'inc' : yesNo(cell('inc'), 'Inc GST', errors);
    if (priceGst === 'inc' && !columns.has('gst')) {
      errors.push('The heading says prices include GST: add a GST column (yes or no) so GST is only taken off items that have it');
    }

    const expected = Math.max(...columns.values()) + 1;
    if (cells.length > expected && !header) {
      errors.push('Too many columns. If a price uses a comma as the decimal point, paste with tabs or type a dot.');
    }

    return { line, ingredient, supplier, packSize, packUnit, packPrice, gstApplicable, priceIncludesGst: priceIncludesGst && gstApplicable, errors };
  });

  const warnings = anyGstCell
    ? []
    : ['No row says whether the item has GST, so every price is taken as GST-free (fresh food). If anything here is taxable, add a GST column with yes or no.'];
  return { rows, error: null, warnings };
}

/** Lower-case, single-spaced: how names are compared between the paste and the database. */
export function matchKey(name: string): string {
  return name.toLowerCase().replace(/\s+/g, ' ').trim();
}
