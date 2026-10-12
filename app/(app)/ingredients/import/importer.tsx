'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { badgeBad, badgeOk, badgeWarn, card, h2, input, label, link, muted, primary, secondary } from '@/components/ui';
import { applyPriceImport, previewPriceImport, type ImportPreview } from './actions';

const EXAMPLE = 'Ingredient\tSupplier\tPack size\tUnit\tPrice\tGST\tInc GST\nLemon\tHarris Farm\t5\tkg\t22.50\tno\tno\nOlive oil\tHarris Farm\t4\tl\t44.00\tyes\tyes';

export function PriceImporter({ since }: { since: string }) {
  const [text, setText] = useState('');
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<number | null>(null);
  const [pending, start] = useTransition();

  const check = () =>
    start(async () => {
      setError(null);
      setSaved(null);
      const result = await previewPriceImport(text);
      if (result.ok) setPreview(result.data!);
      else {
        setPreview(null);
        setError(result.error);
      }
    });

  const save = () =>
    start(async () => {
      setError(null);
      const result = await applyPriceImport(text);
      if (!result.ok) return setError(result.error);
      setSaved(result.data!.saved);
      setPreview(null);
      setText('');
    });

  return (
    <div className="space-y-6">
      <section className={card}>
        <label htmlFor="import-text" className={h2}>1. Paste the price list</label>
        <p className={`mt-1 ${muted}`}>
          Copy the rows from Excel, Google Sheets or an email and paste them here. Columns in this order: ingredient, supplier, pack size,
          unit, price, then optionally GST (yes/no) and price includes GST (yes/no). A heading row is fine.
        </p>
        <textarea
          id="import-text"
          value={text}
          rows={8}
          spellCheck={false}
          onChange={(e) => {
            setText(e.target.value);
            setPreview(null);
            setSaved(null);
          }}
          placeholder={EXAMPLE}
          className={`mt-3 font-mono text-sm ${input}`}
        />
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button type="button" onClick={check} disabled={pending || !text.trim()} className={primary}>
            {pending && !preview ? 'Checking…' : 'Check the list'}
          </button>
          <button type="button" onClick={() => { setText(EXAMPLE); setPreview(null); setSaved(null); }} className={secondary}>
            Show me an example
          </button>
        </div>
        <p className={`mt-3 ${muted}`}>
          Ingredients and suppliers must already exist, spelled the same way. Nothing is saved until you press Save in step 2.
        </p>
      </section>

      {error && (
        <p role="alert" className="text-sm font-semibold text-red-700">
          {error}
        </p>
      )}

      {saved !== null && (
        <section className={card} role="status">
          <p className={badgeOk}>{saved} price{saved === 1 ? '' : 's'} saved</p>
          <p className="mt-2">
            <Link href={`/changes?since=${since}`} className={link}>See which dishes changed</Link>
          </p>
        </section>
      )}

      {preview && (
        <section className={card}>
          <span className={label}>
            <span className={h2}>2. Check and save</span>
          </span>
          <p className="mt-2 flex flex-wrap gap-2">
            <span className={badgeOk}>{preview.ready} ready</span>
            {preview.failed > 0 && <span className={badgeBad}>{preview.failed} to fix</span>}
          </p>
          <ul className="mt-3 divide-y divide-gray-100">
            {preview.rows.map((row) => (
              <li key={row.line} className="py-2.5">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4">
                  <span>
                    <span className={`mr-2 ${muted} tabular-nums`}>Line {row.line}</span>
                    <span className="font-semibold">{row.ingredient || '(no name)'}</span>
                    {row.supplier && <span className={muted}> · {row.supplier}</span>}
                  </span>
                  {row.errors.length === 0 && (
                    <span className="text-right tabular-nums">
                      <span className="font-semibold">{row.after}</span>
                      {row.before && <span className={`ml-2 ${muted}`}>was {row.before}</span>}
                      {row.changePct !== null && Number(row.changePct) !== 0 && (
                        <span className={`ml-2 ${Number(row.changePct) > 0 ? badgeWarn : badgeOk}`}>
                          {Number(row.changePct) > 0 ? '+' : ''}{row.changePct}%
                        </span>
                      )}
                      {!row.before && <span className={`ml-2 ${badgeOk}`}>First price</span>}
                    </span>
                  )}
                </div>
                {row.pack && row.errors.length === 0 && <p className={`${muted} tabular-nums`}>{row.pack}</p>}
                {row.errors.map((message) => (
                  <p key={message} className="mt-1 text-sm font-semibold text-red-700">{message}</p>
                ))}
              </li>
            ))}
          </ul>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button type="button" onClick={save} disabled={pending || preview.failed > 0 || preview.ready === 0} className={primary}>
              {pending ? 'Saving…' : `Save ${preview.ready} price${preview.ready === 1 ? '' : 's'}`}
            </button>
            {preview.failed > 0 && <p className={muted}>Fix the rows in red in the box above, then check again. It is all or nothing.</p>}
          </div>
        </section>
      )}
    </div>
  );
}
