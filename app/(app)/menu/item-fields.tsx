import { input, label, muted } from '@/components/ui';
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
        <input id={`${p}-name`} name="name" required maxLength={120} defaultValue={item?.name} className={input} />
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
        <label htmlFor={`${p}-price`} className={label}>Menu price ($, as printed)</label>
        <input
          id={`${p}-price`}
          name="sellPrice"
          inputMode="decimal"
          required
          defaultValue={item ? (item.sellPriceCents / 100).toFixed(2) : ''}
          className={input}
        />
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
