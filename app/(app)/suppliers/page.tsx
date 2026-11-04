import type { Metadata } from 'next';
import { ActionForm } from '@/components/action-form';
import { ArchiveButton } from '@/components/archive-button';
import { card, h1, h2, input, label, muted } from '@/components/ui';
import { loadCostingData } from '@/lib/queries';
import { requireRole } from '@/lib/session';
import { createSupplier, setSupplierArchived, updateSupplier } from '../actions';

export const metadata: Metadata = { title: 'Suppliers' };

export default async function SuppliersPage() {
  await requireRole('owner', 'chef');
  const { suppliers } = await loadCostingData();
  const active = suppliers.filter((s) => !s.archived);
  const trashed = suppliers.filter((s) => s.archived);

  return (
    <div className="space-y-6">
      <h1 className={h1}>Suppliers</h1>

      <section className={card}>
        <h2 className={h2}>Add a supplier</h2>
        <ActionForm action={createSupplier} submitLabel="Add supplier" savedLabel="Added" resetOnSuccess className="mt-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="supplier-name" className={label}>Name</label>
              <input id="supplier-name" name="name" required maxLength={120} className={input} />
            </div>
            <div>
              <label htmlFor="supplier-contact" className={label}>Contact (optional)</label>
              <input id="supplier-contact" name="contact" maxLength={200} placeholder="Phone, rep, order day" className={input} />
            </div>
          </div>
        </ActionForm>
      </section>

      <section className={card}>
        <h2 className={h2}>Your suppliers</h2>
        {active.length === 0 ? (
          <p className={`mt-2 ${muted}`}>None yet. Add the first one above, then add prices on each ingredient.</p>
        ) : (
          <ul className="mt-2 divide-y divide-gray-100">
            {active.map((s) => (
              <li key={s.id} className="py-3">
                <details className="group">
                  <summary className="flex min-h-11 cursor-pointer list-none flex-wrap items-center justify-between gap-3">
                    <span>
                      <span className="block font-semibold">{s.name}</span>
                      {s.contact && <span className={`block ${muted}`}>{s.contact}</span>}
                    </span>
                    <span className="text-sm font-semibold text-mazcina-wood group-open:hidden">Edit</span>
                  </summary>
                  <ActionForm action={updateSupplier} submitLabel="Save changes" className="mt-3" key={`${s.name}|${s.contact}`}>
                    <input type="hidden" name="id" value={s.id} />
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <label htmlFor={`supplier-${s.id}-name`} className={label}>Name</label>
                        <input id={`supplier-${s.id}-name`} name="name" required maxLength={120} defaultValue={s.name} className={input} />
                      </div>
                      <div>
                        <label htmlFor={`supplier-${s.id}-contact`} className={label}>Contact</label>
                        <input id={`supplier-${s.id}-contact`} name="contact" maxLength={200} defaultValue={s.contact ?? ''} placeholder="Phone, rep, order day" className={input} />
                      </div>
                    </div>
                  </ActionForm>
                  <div className="mt-3">
                    <ArchiveButton action={setSupplierArchived.bind(null, s.id)} archived={false} />
                  </div>
                </details>
              </li>
            ))}
          </ul>
        )}
      </section>

      {trashed.length > 0 && (
        <section className={card}>
          <h2 className={h2}>Trash</h2>
          <ul className="mt-2 divide-y divide-gray-100">
            {trashed.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <p className="font-semibold">{s.name}</p>
                <ArchiveButton action={setSupplierArchived.bind(null, s.id)} archived />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
