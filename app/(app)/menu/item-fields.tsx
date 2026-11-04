import { Affix } from '@/components/affix';
import { checkbox, input, label, muted } from '@/components/ui';
import { MENU_CATEGORIES, type MenuItemDto, type RecipeDto } from '@/lib/types';

/** Fields of a menu item, shared by the add and edit forms. */
export function ItemFields({ item, recipes, categories }: { item?: MenuItemDto; recipes: RecipeDto[]; categories: string[] }) {
  const p = item ? `item-${item.id}` : 'item-new';
  const sections = [...new Set([...MENU_CATEGORIES, ...categories])];
  const dishes = recipes.filter((r) => !r.archived || r.id === item?.recipeId);
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div>
        <label htmlFor={`${p}-name`} className={label}>Name on the menu</label>
        <input id={`${p}-name`} name="name" enterKeyHint="next" required maxLength={120} defaultValue={item?.name} className={input} />
      </div>
      <div>
        <label htmlFor={`${p}-category`} className={label}>Section</label>
        <select id={`${p}-category`} name="category" defaultValue={item?.category ?? sections[0]} className={input}>
          {sections.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor={`${p}-price`} className={label}>Menu price, as printed</label>
        <Affix prefix="$">
          <input
            id={`${p}-price`}
            name="sellPrice"
            inputMode="decimal"
            enterKeyHint="next"
            required
            placeholder="24.00"
            defaultValue={item ? (item.sellPriceCents / 100).toFixed(2) : ''}
            className={`${input} pl-7`}
          />
        </Affix>
        <label className="mt-1 flex min-h-11 items-center gap-2 text-sm">
          <input type="checkbox" name="free" defaultChecked={item?.sellPriceCents === 0} className={checkbox} />
          Free or included (an add-on, or comes with another dish)
        </label>
      </div>
      <div>
        <label htmlFor={`${p}-recipe`} className={label}>Recipe</label>
        <select id={`${p}-recipe`} name="recipeId" defaultValue={item?.recipeId ?? ''} className={input}>
          <option value="">Not costed yet</option>
          {dishes.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}{r.type === 'prep' ? ' (prep)' : ''}
            </option>
          ))}
        </select>
        <p className={`mt-1 ${muted}`}>Pick the recipe for one serve of this item.</p>
      </div>
    </div>
  );
}
