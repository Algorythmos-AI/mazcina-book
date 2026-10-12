import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArchiveButton } from '@/components/archive-button';
import { badgeWarn, h1, muted } from '@/components/ui';
import { loadCostingData } from '@/lib/queries';
import { requireRole } from '@/lib/session';
import { setRecipeArchived } from '../../actions';
import { RecipeBuilder } from './builder';

export const metadata: Metadata = { title: 'Recipe' };

export default async function RecipePage({ params }: PageProps<'/recipes/[id]'>) {
  await requireRole('owner', 'chef');
  const { id } = await params;
  const data = await loadCostingData();
  const recipe = data.recipes.find((r) => r.id === id);
  if (!recipe) notFound();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/recipes" className={`${muted} font-semibold hover:text-mazcina-wood`}>← Recipes</Link>
          <h1 className={`mt-1 ${h1}`}>{recipe.name}</h1>
        </div>
        <ArchiveButton action={setRecipeArchived.bind(null, recipe.id)} archived={recipe.archived} redirectTo="/recipes" />
      </div>
      {recipe.archived ? (
        <p className={badgeWarn}>This recipe is in the trash. Restore it to edit.</p>
      ) : (
        <RecipeBuilder recipe={recipe} data={data} />
      )}
    </div>
  );
}
