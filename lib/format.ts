import DecimalJs from 'decimal.js';
import { convertToBase, UNITS, type BaseUnit, type Ingredient, type Issue, type IssueCode, type Unit } from './costing';

type Numeric = string | number | DecimalJs;

/** "$12.35". Rounds half up, for display only. */
export function money(value: Numeric): string {
  return `$${new DecimalJs(value).toFixed(2, DecimalJs.ROUND_HALF_UP)}`;
}

export function moneyFromCents(cents: number): string {
  return money(new DecimalJs(cents).div(100));
}

export function percent(value: Numeric): string {
  return `${new DecimalJs(value).toFixed(1, DecimalJs.ROUND_HALF_UP)}%`;
}

/** Trim a stored numeric like "150.0000" to "150". */
export function plain(value: Numeric | null | undefined): string {
  if (value === null || value === undefined || value === '') return '';
  return new DecimalJs(value).toString();
}

/** Cost of one base unit shown at a scale a chef recognises: per kg, per litre or each. */
export function unitPrice(costPerBaseUnit: Numeric, baseUnit: BaseUnit): string {
  const d = new DecimalJs(costPerBaseUnit);
  if (baseUnit === 'g') return `${money(d.times(1000))} / kg`;
  if (baseUnit === 'ml') return `${money(d.times(1000))} / l`;
  return `${money(d)} each`;
}

/** Units a quantity of this ingredient can be entered in, given the conversions it has. */
export function unitsForIngredient(ingredient: Pick<Ingredient, 'baseUnit' | 'gramsPerEach' | 'gramsPerMl'>): Unit[] {
  return (Object.keys(UNITS) as Unit[]).filter(
    (unit) => convertToBase(1, unit, ingredient.baseUnit, ingredient) !== null,
  );
}

export function unitsForDimension(unit: Unit): Unit[] {
  const base = UNITS[unit].base;
  return (Object.keys(UNITS) as Unit[]).filter((u) => UNITS[u].base === base);
}

const ISSUE_TEXT: Record<IssueCode, (subject: string) => string> = {
  no_lines: () => 'Add at least one ingredient',
  invalid_line: () => 'A line is broken, remove it and add it again',
  invalid_quantity: () => 'A quantity is missing or not a number',
  invalid_portions: () => 'Portions must be more than zero',
  invalid_yield: (s) => `${s}: check the yield`,
  invalid_price: (s) => `${s}: the latest price looks wrong`,
  missing_ingredient: () => 'An ingredient no longer exists',
  archived_ingredient: (s) => `${s} is in the trash`,
  no_price: (s) => `${s} has no price yet`,
  needs_conversion: (s) => `${s}: this unit needs a conversion (grams per each / per ml)`,
  missing_recipe: () => 'A prep no longer exists',
  archived_recipe: (s) => `${s} is in the trash`,
  sub_recipe_incomplete: (s) => `${s} is not fully costed yet`,
  sub_recipe_no_yield: (s) => `${s} needs a batch yield`,
  cycle: (s) => `${s} would contain itself`,
  too_deep: (s) => `${s}: too many preps inside preps`,
};

export function issueText(issue: Issue): string {
  return ISSUE_TEXT[issue.code](issue.subject ?? 'This item');
}

export function todaySydney(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Sydney' }).format(now);
}

export function displayDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}
