import { input, label, muted } from '@/components/ui';
import { plain } from '@/lib/format';
import { BASE_UNIT_LABEL, type IngredientDto, type SupplierDto } from '@/lib/types';

/** The fields of an ingredient, shared by the add and edit forms. */
export function IngredientFields({ ingredient, suppliers }: { ingredient?: IngredientDto; suppliers: SupplierDto[] }) {
  const p = ingredient ? `ing-${ingredient.id}` : 'ing-new';
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div>
        <label htmlFor={`${p}-name`} className={label}>Name</label>
        <input id={`${p}-name`} name="name" required maxLength={120} defaultValue={ingredient?.name} className={input} />
      </div>
      <div>
        <label htmlFor={`${p}-category`} className={label}>Category (optional)</label>
        <input id={`${p}-category`} name="category" maxLength={60} defaultValue={ingredient?.category ?? ''} placeholder="Produce, seafood, dairy…" className={input} />
      </div>
      <div>
        <label htmlFor={`${p}-base`} className={label}>Measured in</label>
        <select id={`${p}-base`} name="baseUnit" defaultValue={ingredient?.baseUnit ?? 'g'} className={input}>
          {(Object.keys(BASE_UNIT_LABEL) as (keyof typeof BASE_UNIT_LABEL)[]).map((u) => (
            <option key={u} value={u}>{BASE_UNIT_LABEL[u]}</option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor={`${p}-yield`} className={label}>Usable % after trimming</label>
        <input id={`${p}-yield`} name="yieldPct" inputMode="decimal" defaultValue={plain(ingredient?.yieldPct ?? '100')} className={input} />
        <p className={`mt-1 ${muted}`}>100 if nothing is lost. A whole fish that gives 45% fillet is 45.</p>
      </div>
      <div>
        <label htmlFor={`${p}-supplier`} className={label}>Preferred supplier</label>
        <select id={`${p}-supplier`} name="preferredSupplierId" defaultValue={ingredient?.preferredSupplierId ?? ''} className={input}>
          <option value="">Latest price from anyone</option>
          {suppliers.filter((s) => !s.archived || s.id === ingredient?.preferredSupplierId).map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </div>
      <fieldset className="sm:col-span-2">
        <legend className={label}>Conversions (only if you buy it one way and use it another)</legend>
        <div className="mt-1 grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor={`${p}-gpe`} className={muted}>Grams in one piece</label>
            <input id={`${p}-gpe`} name="gramsPerEach" inputMode="decimal" defaultValue={plain(ingredient?.gramsPerEach)} placeholder="e.g. 120 for a lemon" className={input} />
          </div>
          <div>
            <label htmlFor={`${p}-gpm`} className={muted}>Grams in one ml</label>
            <input id={`${p}-gpm`} name="gramsPerMl" inputMode="decimal" defaultValue={plain(ingredient?.gramsPerMl)} placeholder="e.g. 0.92 for olive oil" className={input} />
          </div>
        </div>
      </fieldset>
    </div>
  );
}
