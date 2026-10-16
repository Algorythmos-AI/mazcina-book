'use server';

import { revalidatePath } from 'next/cache';
import packJson from '@/data/kitchen/mazcina-kitchen-data.json';
import { applyImport } from '@/lib/kitchen-data/import';
import { packSchema } from '@/lib/kitchen-data/pack';
import { requireRole } from '@/lib/session';
import type { ActionResult } from '@/lib/types';

/** Owner only: loads the bundled kitchen data pack. Adds what is missing; never changes existing records. */
export async function importKitchenData(): Promise<ActionResult> {
  const user = await requireRole('owner');
  try {
    await applyImport(packSchema.parse(packJson), user.email);
  } catch (error) {
    console.error('[kitchen-data] import failed', error);
    return { ok: false, error: error instanceof Error ? error.message : 'The import failed; nothing was changed.' };
  }
  revalidatePath('/', 'layout');
  return { ok: true };
}
