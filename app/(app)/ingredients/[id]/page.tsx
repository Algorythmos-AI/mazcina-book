import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ActionForm } from '@/components/action-form';
import { ArchiveButton } from '@/components/archive-button';
import { badgeWarn, card, h1, h2, input, label, muted } from '@/components/ui';
import { ingredientUnitCost, selectPrice } from '@/lib/costing';
import { displayDate, issueText, money, plain, unitPrice, unitsForIngredient } from '@/lib/format';
import { contextFrom, loadCostingData } from '@/lib/queries';
import { requireRole } from '@/lib/session';
import { addPrice, setIngredientArchived, updateIngredient } from '../../actions';
import { IngredientFields } from '../ingredient-fields';

export const metadata: Metadata = { title: 'Ingredient' };

export default async function IngredientPage({ params }: PageProps<'/ingredients/[id]'>) {
  await requireRole('owner', 'chef');
  const { id } = await params;
  const data = await loadCostingData();
  const ingredient = data.ingredients.find((i) => i.id === id);
  if (!ingredient) notFound();

  const ctx = contextFrom(data);
  const cost = ingredientUnitCost(ingredient.id, ctx);
  const history = data.prices.filter((p) => p.ingredientId === ingredient.id);
  const current = selectPrice(history, ingredient.preferredSupplierId, data.asOf);
  const suppliers = data.suppliers.filter((s) => !s.archived);
  const supplierName = new Map(data.suppliers.map((s) => [s.id, s.name]));
  const usedIn = data.recipes.filter((r) => !r.archived && r.lines.some((l) => l.ingredientId === ingredient.id));
  const units = unitsForIngredient(ingredient);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/ingredients" className={`${muted} font-semibold hover:text-mazcina-wood`}>← Ingredients</Link>
        <h1 className={`mt-1 ${h1}`}>{ingredient.name}</h1>
        <p className="mt-1 text-lg font-semibold">
          {ingredient.archived ? (
            <span className={badgeWarn}>In the trash</span>
          ) : cost.ok ? (
            unitPrice(cost.value, ingredient.baseUnit)
          ) : (
            <span className={badgeWarn}>{issueText({ ...cost.issue, subject: ingredient.name })}</span>
          )}
        </p>
      </div>

      {!ingredient.archived && (
        <section className={card}>
          <h2 className={h2}>New price</h2>
          {suppliers.length === 0 ? (
            <p className={`mt-2 ${muted}`}>
              Add a supplier first on the <Link href="/suppliers" className="font-semibold text-mazcina-wood underline">Suppliers</Link> page.
            </p>
          ) : (
            <ActionForm action={addPrice} submitLabel="Save price" savedLabel="Price saved" resetOnSuccess className="mt-3">
              <input type="hidden" name="ingredientId" value={ingredient.id} />
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="col-span-2">
                  <label htmlFor="price-supplier" className={label}>Supplier</label>
                  <select id="price-supplier" name="supplierId" defaultValue={current?.supplierId ?? ingredient.preferredSupplierId ?? suppliers[0].id} className={input}>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="price-size" className={label}>Pack size</label>
                  <input id="price-size" name="packSize" inputMode="decimal" required defaultValue={plain(current?.packSize)} className={input} />
                </div>
                <div>
                  <label htmlFor="price-unit" className={label}>Unit</label>
                  <select id="price-unit" name="packUnit" defaultValue={current?.packUnit ?? (ingredient.baseUnit === 'g' ? 'kg' : ingredient.baseUnit === 'ml' ? 'l' : 'each')} className={input}>
                    {units.map((u) => (
                      <option key={u} value={u}>{u}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="price-amount" className={label}>Pack price ($)</label>
                  <input id="price-amount" name="packPrice" inputMode="decimal" required className={input} />
                </div>
                <div>
                  <label htmlFor="price-date" className={label}>From</label>
                  <input id="price-date" name="effectiveDate" type="date" defaultValue={data.asOf} className={input} />
                </div>
                <label className="col-span-2 flex min-h-11 items-center gap-2 text-sm font-semibold">
                  <input type="checkbox" name="gstApplicable" defaultChecked={current?.gstApplicable ?? false} className="size-5" />
                  This item has GST
                </label>
                <label className="col-span-2 flex min-h-11 items-center gap-2 text-sm font-semibold">
                  <input type="checkbox" name="priceIncludesGst" defaultChecked={current?.priceIncludesGst ?? false} className="size-5" />
                  The price I typed includes GST
                </label>
              </div>
              <p className={`mt-2 ${muted}`}>Fresh produce, meat and fish have no GST. Most packaged goods and drinks do.</p>
            </ActionForm>
          )}
        </section>
      )}

      <section className={card}>
        <h2 className={h2}>Price history</h2>
        {history.length === 0 ? (
          <p className={`mt-2 ${muted}`}>No prices yet.</p>
        ) : (
          <ul className="mt-2 divide-y divide-gray-100">
            {[...history].reverse().map((p) => (
              <li key={p.id} className="flex flex-wrap items-baseline justify-between gap-x-4 py-2.5">
                <span>
                  <span className="font-semibold tabular-nums">{money(p.packPrice)}</span> for {plain(p.packSize)} {p.packUnit}
                  {p.gstApplicable && <span className={muted}> ({p.priceIncludesGst ? 'inc' : 'ex'} GST)</span>}
                  {p === current && <span className="ml-2 rounded-sm bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-900">In use</span>}
                  {p.effectiveDate > data.asOf && <span className={`ml-2 ${badgeWarn}`}>Starts later</span>}
                </span>
                <span className={muted}>
                  {supplierName.get(p.supplierId) ?? 'Unknown'} · from {displayDate(p.effectiveDate)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {!ingredient.archived && (
        <section className={card}>
          <h2 className={h2}>Details</h2>
          <ActionForm action={updateIngredient} submitLabel="Save details" className="mt-3" key={ingredient.version}>
            <input type="hidden" name="id" value={ingredient.id} />
            <input type="hidden" name="version" value={ingredient.version} />
            <IngredientFields ingredient={ingredient} suppliers={data.suppliers} />
          </ActionForm>
        </section>
      )}

      <section className={card}>
        <h2 className={h2}>Used in</h2>
        {usedIn.length === 0 ? (
          <p className={`mt-2 ${muted}`}>Not used in any recipe yet.</p>
        ) : (
          <ul className="mt-2 flex flex-wrap gap-2">
            {usedIn.map((r) => (
              <li key={r.id}>
                <Link href={`/recipes/${r.id}`} className="inline-flex min-h-11 items-center rounded-sm border border-mazcina-wood/40 px-3 text-sm font-semibold text-mazcina-wood">
                  {r.name}
                </Link>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-4">
          <ArchiveButton action={setIngredientArchived.bind(null, ingredient.id)} archived={ingredient.archived} redirectTo="/ingredients" />
        </div>
      </section>
    </div>
  );
}
