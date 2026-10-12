import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PrintButton } from '@/components/print-button';
import { h1, muted, secondary } from '@/components/ui';
import { displayDate, plain } from '@/lib/format';
import { loadMenuSheet } from '@/lib/menu-sheet';
import { requireRole } from '@/lib/session';

export const metadata: Metadata = { title: 'Costing sheet' };

export default async function SheetPage({ searchParams }: PageProps<'/menu/sheet'>) {
  await requireRole('owner', 'chef');
  const { m } = await searchParams;
  const sheet = await loadMenuSheet(typeof m === 'string' ? m : undefined);
  if (!sheet) notFound();
  const { menu, asOf, settings, groups } = sheet;
  const cell = 'px-2 py-1.5 text-right tabular-nums';

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href={`/menu?m=${menu.id}`} className={`${muted} font-semibold hover:text-mazcina-wood print:hidden`}>← {menu.name}</Link>
          <h1 className={`mt-1 ${h1}`}>{menu.name}: costing sheet</h1>
          <p className={muted}>
            Costs as at {displayDate(asOf)}, before GST. Target food cost {plain(settings.targetFoodCostPct)}%.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 print:hidden">
          <a href={`/menu/export?m=${menu.id}`} className={secondary}>Download for Excel</a>
          <PrintButton />
        </div>
      </div>

      <div className="overflow-x-auto rounded-md border border-gray-100 bg-white shadow-sm print:border-0 print:shadow-none">
        <table className="w-full min-w-[40rem] border-collapse text-sm">
          <thead>
            <tr className="border-b-2 border-mazcina-emerald text-left">
              <th scope="col" className="px-2 py-2">Item</th>
              <th scope="col" className={cell}>Menu price</th>
              <th scope="col" className={cell}>Cost</th>
              <th scope="col" className={cell}>Food cost</th>
              <th scope="col" className={cell}>Profit</th>
              <th scope="col" className={cell}>Price at target</th>
            </tr>
          </thead>
          {groups.map(([category, rows]) => (
            <tbody key={category} className="break-inside-avoid">
              <tr>
                <th scope="colgroup" colSpan={6} className="bg-mazcina-bg px-2 py-1.5 text-left text-xs font-bold uppercase tracking-wide text-mazcina-wood">
                  {category}
                </th>
              </tr>
              {rows.map((row) => (
                <tr key={row.name} className="border-b border-gray-100">
                  <th scope="row" className="px-2 py-1.5 text-left font-semibold">{row.name}</th>
                  <td className={cell}>${row.price}</td>
                  {row.cost ? (
                    <>
                      <td className={cell}>${row.cost}</td>
                      <td className={`${cell} font-bold ${row.rating === 'high' ? 'text-red-700' : row.rating === 'watch' ? 'text-amber-700' : ''}`}>
                        {row.foodCostPct ? `${row.foodCostPct}%` : '—'}
                      </td>
                      <td className={cell}>${row.profit}</td>
                      <td className={cell}>{row.suggested ? `$${row.suggested}` : '—'}</td>
                    </>
                  ) : (
                    <td colSpan={4} className={`${cell} ${muted}`}>{row.note}</td>
                  )}
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>
    </div>
  );
}
