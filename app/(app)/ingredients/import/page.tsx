import type { Metadata } from 'next';
import Link from 'next/link';
import { h1, muted } from '@/components/ui';
import { todaySydney } from '@/lib/format';
import { requireRole } from '@/lib/session';
import { PriceImporter } from './importer';

export const metadata: Metadata = { title: 'Import prices' };

export default async function ImportPricesPage() {
  await requireRole('owner', 'chef');
  return (
    <div className="space-y-6">
      <div>
        <Link href="/ingredients" className={`${muted} font-semibold hover:text-mazcina-wood`}>← Ingredients</Link>
        <h1 className={`mt-1 ${h1}`}>Import prices</h1>
      </div>
      <PriceImporter since={todaySydney()} />
    </div>
  );
}
