import type { IngredientPrice } from '@/lib/costing';
import { plain } from '@/lib/format';
import { gstMode } from '@/lib/price-check';
import type { LastPrice } from './price-form';

/** The price in use, shaped for the price form's hint and its "is this right?" check. */
export function lastPrice(current: IngredientPrice | null, supplierName: Map<string, string>, unitCost: string | null): LastPrice | null {
  if (!current) return null;
  return {
    supplierId: current.supplierId,
    supplierName: supplierName.get(current.supplierId) ?? 'a supplier',
    packSize: plain(current.packSize),
    packUnit: current.packUnit,
    packPrice: plain(current.packPrice),
    gst: gstMode(current),
    unitCost,
  };
}
