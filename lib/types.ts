/** Plain, serialisable shapes shared by server queries and client screens. */
import type { BaseUnit, Ingredient, IngredientPrice, Recipe, Unit } from './costing';

export type ActionResult<T = void> = { ok: true; data?: T } | { ok: false; error: string };

export interface SupplierDto {
  id: string;
  name: string;
  contact: string | null;
  archived: boolean;
}

export interface IngredientDto extends Ingredient {
  category: string | null;
  yieldPct: string;
  gramsPerEach: string | null;
  gramsPerMl: string | null;
  /** Reorder point in base units. */
  parLevel: string | null;
  version: number;
  archived: boolean;
}

export interface PriceDto extends IngredientPrice {
  id: string;
  packSize: string;
  packPrice: string;
  createdBy: string | null;
}

export interface RecipeDto extends Recipe {
  type: 'dish' | 'prep';
  yieldQuantity: string | null;
  yieldUnit: Unit | null;
  yieldEstimated: boolean;
  portions: string;
  notes: string | null;
  version: number;
  archived: boolean;
}

export interface SettingsDto {
  gstRegistered: boolean;
  targetFoodCostPct: string;
}

export interface CostingData {
  suppliers: SupplierDto[];
  ingredients: IngredientDto[];
  prices: PriceDto[];
  recipes: RecipeDto[];
  settings: SettingsDto;
  asOf: string;
}

export const UNIT_OPTIONS: Unit[] = ['g', 'kg', 'ml', 'l', 'each'];
export const BASE_UNIT_LABEL: Record<BaseUnit, string> = { g: 'Weight (g / kg)', ml: 'Volume (ml / l)', each: 'Count (each)' };

export interface MenuItemDto {
  id: string;
  menuId: string;
  recipeId: string | null;
  name: string;
  category: string;
  sellPriceCents: number;
  sortOrder: number;
  version: number;
  archived: boolean;
}

export interface MenuDto {
  id: string;
  name: string;
  kind: 'seasonal' | 'special';
  status: 'draft' | 'live' | 'archived';
  items: MenuItemDto[];
}

/** Menu sections in the order they are printed. Anything else sorts after these. */
export const MENU_CATEGORIES = [
  'Starters',
  'Chef Suggestions for Sharing',
  'Mains',
  'Sandwiches',
  'Salads',
  'Sides',
  'Kids Menu',
  'Desserts',
  'Add-ons',
] as const;
