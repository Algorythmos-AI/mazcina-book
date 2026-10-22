import 'server-only';
import DecimalJs from 'decimal.js';
import { costMenuItem, groupByCategory } from './menu';
import { contextFrom, loadCostingData, loadMenus } from './queries';

/** One menu fully costed as of today, in printed order, for the costing sheet and the CSV. */
export async function loadMenuSheet(menuId: string | undefined) {
  const [data, menus] = await Promise.all([loadCostingData(), loadMenus()]);
  const menu = menus.find((m) => m.id === menuId) ?? menus.find((m) => m.status === 'live' && m.kind === 'seasonal') ?? menus[0];
  if (!menu) return null;
  const ctx = contextFrom(data);
  const rows = menu.items
    .filter((i) => !i.archived)
    .map((item) => {
      const costing = costMenuItem(item, ctx, data.settings);
      const ok = costing.status === 'ok';
      return {
        category: item.category,
        name: item.name,
        price: new DecimalJs(item.sellPriceCents).div(100).toFixed(2),
        cost: ok ? costing.cost.toFixed(2, DecimalJs.ROUND_HALF_UP) : null,
        foodCostPct: ok && costing.foodCostPct ? costing.foodCostPct.toFixed(1, DecimalJs.ROUND_HALF_UP) : null,
        profit: ok ? costing.grossProfit.toFixed(2, DecimalJs.ROUND_HALF_UP) : null,
        suggested: ok && costing.suggestedCents !== null ? new DecimalJs(costing.suggestedCents).div(100).toFixed(2) : null,
        rating: ok ? costing.rating : null,
        note:
          costing.status === 'uncosted'
            ? 'Not costed'
            : costing.status === 'incomplete'
              ? 'Recipe incomplete'
              : [costing.estimates.length > 0 && 'Estimate', costing.asNeeded.length > 0 && 'Excludes as-needed items'].filter(Boolean).join('; '),
      };
    });
  return { menu, asOf: data.asOf, settings: data.settings, groups: groupByCategory(rows), rows };
}
