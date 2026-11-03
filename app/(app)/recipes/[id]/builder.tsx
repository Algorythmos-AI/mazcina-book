'use client';

import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  pointerWithin,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
} from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { isConnectionError } from '@/components/action-form';
import { badgeOk, badgeWarn, card, h2, input, label, muted, primary, secondary } from '@/components/ui';
import {
  costRecipe,
  createContext,
  parseDecimalInput,
  suggestedSellPriceCents,
  UNITS,
  wouldCreateCycle,
  type Unit,
} from '@/lib/costing';
import { issueText, money, moneyFromCents, plain, unitsForDimension, unitsForIngredient } from '@/lib/format';
import type { CostingData, RecipeDto } from '@/lib/types';
import { saveRecipe, type RecipeConflict } from '../../actions';

interface DraftLine {
  key: string;
  ingredientId: string | null;
  subRecipeId: string | null;
  quantity: string;
  unit: Unit;
}

interface Draft {
  name: string;
  type: 'dish' | 'prep';
  yieldQuantity: string;
  yieldUnit: Unit;
  yieldEstimated: boolean;
  portions: string;
  /** One per line, as typed. */
  asNeeded: string;
  notes: string;
  lines: DraftLine[];
}

type SaveState =
  | { kind: 'saved'; pending?: string }
  | { kind: 'waiting' }
  | { kind: 'saving' }
  | { kind: 'incomplete'; reason: string }
  | { kind: 'leftover'; count: number }
  | { kind: 'conflict'; conflict: RecipeConflict }
  | { kind: 'error'; message: string };

const AUTOSAVE_MS = 900;
const LINES_ZONE = 'lines';
const POOL_PREFIX = 'pool:';

/**
 * A pool item dropped on a line goes in at that line; dropped anywhere else in
 * the recipe it goes to the end; dropped outside it is ignored. Lines being
 * reordered snap to the nearest line.
 */
const collisions: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  if (hits.length > 0) return [...hits.filter((h) => h.id !== LINES_ZONE), ...hits.filter((h) => h.id === LINES_ZONE)];
  return String(args.active.id).startsWith(POOL_PREFIX) ? [] : closestCenter(args);
};

function toDraft(recipe: RecipeDto): Draft {
  return {
    name: recipe.name,
    type: recipe.type,
    yieldQuantity: plain(recipe.yieldQuantity),
    yieldUnit: recipe.yieldUnit ?? 'kg',
    yieldEstimated: recipe.yieldEstimated,
    portions: plain(recipe.portions),
    asNeeded: recipe.asNeeded.join('\n'),
    notes: recipe.notes ?? '',
    lines: recipe.lines.map((l) => ({
      key: l.id,
      ingredientId: l.ingredientId ?? null,
      subRecipeId: l.subRecipeId ?? null,
      quantity: plain(l.quantity),
      unit: l.unit,
    })),
  };
}

const asNeededList = (raw: string) => [...new Set(raw.split('\n').map((s) => s.trim()).filter(Boolean))];

const positive = (raw: string) => {
  const parsed = parseDecimalInput(raw);
  return parsed !== null && Number(parsed) > 0 ? parsed : null;
};

/** What stops this draft being saved, in the chef's words, or null when it is ready. */
function blocker(draft: Draft): string | null {
  if (!draft.name.trim()) return 'Give the recipe a name';
  if (!positive(draft.portions)) return 'Portions must be a number above zero';
  if (draft.type === 'prep' && !positive(draft.yieldQuantity)) return 'A prep needs a batch yield';
  if (draft.yieldQuantity.trim() && !positive(draft.yieldQuantity)) return 'The batch yield is not a number';
  return null;
}

const whenFormat = new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Sydney', weekday: 'short', hour: 'numeric', minute: '2-digit' });

export function RecipeBuilder({ recipe, data }: { recipe: RecipeDto; data: CostingData }) {
  const [draft, setDraft] = useState<Draft>(() => toDraft(recipe));
  // A line left without a quantity last time was not saved: say so until the next save.
  const [save, setSave] = useState<SaveState>(recipe.pendingLines > 0 ? { kind: 'leftover', count: recipe.pendingLines } : { kind: 'saved' });
  const router = useRouter();
  const [search, setSearch] = useState('');
  // On a phone the ingredient list opens over the recipe, instead of sitting far below it.
  const [poolOpen, setPoolOpen] = useState(false);
  const focusLine = useRef<string | null>(null);

  const version = useRef(recipe.version);
  const latest = useRef(draft);
  const dirty = useRef(false);
  const saving = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flushRef = useRef<() => Promise<boolean | void>>(async () => {});
  const schedule = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => flushRef.current(), AUTOSAVE_MS);
  }, []);

  const flush = useCallback(async () => {
    if (saving.current || !dirty.current) return;
    const snapshot = latest.current;
    const reason = blocker(snapshot);
    if (reason) return setSave({ kind: 'incomplete', reason });

    // Lines still waiting for a quantity stay on screen and are saved once they have one;
    // the rest of the recipe is saved now, so nothing typed so far can be lost.
    const complete = snapshot.lines.filter((l) => positive(l.quantity));
    const pendingIndex = snapshot.lines.findIndex((l) => !positive(l.quantity));

    saving.current = true;
    dirty.current = false;
    setSave({ kind: 'saving' });
    let result: Awaited<ReturnType<typeof saveRecipe>>;
    try {
      result = await saveRecipe({
        id: recipe.id,
        version: version.current,
        name: snapshot.name,
        type: snapshot.type,
        yieldQuantity: snapshot.yieldQuantity,
        yieldUnit: snapshot.yieldQuantity.trim() ? snapshot.yieldUnit : null,
        yieldEstimated: snapshot.yieldQuantity.trim() ? snapshot.yieldEstimated : false,
        portions: snapshot.portions,
        asNeeded: asNeededList(snapshot.asNeeded),
        notes: snapshot.notes,
        lines: complete.map((l) => ({
          ingredientId: l.ingredientId,
          subRecipeId: l.subRecipeId,
          quantity: l.quantity,
          unit: l.unit,
        })),
        pendingLines: snapshot.lines.length - complete.length,
      });
    } catch (error) {
      if (!isConnectionError(error)) throw error;
      result = { ok: false, error: 'No connection. Your changes are still here; they will be saved when you tap Retry.' };
    }
    saving.current = false;

    if (!result.ok) {
      dirty.current = true;
      return setSave('conflict' in result ? { kind: 'conflict', conflict: result.conflict } : { kind: 'error', message: result.error });
    }
    version.current = result.data!.version;
    if (dirty.current) {
      setSave({ kind: 'waiting' });
      schedule();
    } else {
      setSave({ kind: 'saved', pending: pendingIndex >= 0 ? `line ${pendingIndex + 1} needs a quantity before it is saved` : undefined });
    }
    return true;
  }, [recipe.id, schedule]);

  /** Keep this version: save on top of theirs, which is now the one being replaced. */
  const keepMine = useCallback((conflict: RecipeConflict) => {
    version.current = conflict.version;
    dirty.current = true;
    void flush();
  }, [flush]);

  useEffect(() => {
    flushRef.current = flush;
  }, [flush]);

  const change = useCallback(
    (update: (d: Draft) => Draft) => {
      setDraft((current) => {
        const next = update(current);
        latest.current = next;
        return next;
      });
      dirty.current = true;
      setSave((s) => (s.kind === 'saving' ? s : { kind: 'waiting' }));
      schedule();
    },
    [schedule],
  );

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (dirty.current || saving.current) event.preventDefault();
    };
    // Tapping a link inside the app does not fire beforeunload: save first, then go.
    const onLink = (event: MouseEvent) => {
      const link = event.target instanceof Element ? event.target.closest('a[href]') : null;
      if (!link || event.defaultPrevented || event.metaKey || event.ctrlKey || link.getAttribute('target') === '_blank') return;
      const href = link.getAttribute('href') ?? '';
      if (!href.startsWith('/')) return;
      const unfinished = latest.current.lines.findIndex((l) => !positive(l.quantity));
      if (!dirty.current && !saving.current && unfinished < 0) return;
      event.preventDefault();
      event.stopPropagation();
      void (async () => {
        if (timer.current) clearTimeout(timer.current);
        while (saving.current) await new Promise((r) => setTimeout(r, 100));
        if (dirty.current && !(await flushRef.current())) return; // the save failed: stay, the error is on screen
        if (unfinished >= 0 && !window.confirm(`Line ${unfinished + 1} has no quantity, so it is not saved. Leave anyway?`)) return;
        router.push(href);
      })();
    };
    window.addEventListener('beforeunload', warn);
    document.addEventListener('click', onLink, true);
    return () => {
      window.removeEventListener('beforeunload', warn);
      document.removeEventListener('click', onLink, true);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [router]);

  const ingredientById = useMemo(() => new Map(data.ingredients.map((i) => [i.id, i])), [data.ingredients]);
  const recipeById = useMemo(() => new Map(data.recipes.map((r) => [r.id, r])), [data.recipes]);

  // Cost the draft exactly as the server will, with this recipe swapped for what is on screen.
  const cost = useMemo(() => {
    const live: RecipeDto = {
      ...recipe,
      name: draft.name || recipe.name,
      type: draft.type,
      yieldQuantity: draft.yieldQuantity.trim() ? (positive(draft.yieldQuantity) ?? '0') : null,
      yieldUnit: draft.yieldQuantity.trim() ? draft.yieldUnit : null,
      yieldEstimated: draft.yieldQuantity.trim() ? draft.yieldEstimated : false,
      portions: positive(draft.portions) ?? '0',
      asNeeded: asNeededList(draft.asNeeded),
      lines: draft.lines.map((l) => ({
        id: l.key,
        ingredientId: l.ingredientId,
        subRecipeId: l.subRecipeId,
        quantity: positive(l.quantity) ?? '0',
        unit: l.unit,
      })),
    };
    const ctx = createContext({
      ingredients: data.ingredients,
      prices: data.prices,
      recipes: data.recipes.map((r) => (r.id === recipe.id ? live : r)),
      asOf: data.asOf,
      gstRegistered: data.settings.gstRegistered,
    });
    return costRecipe(recipe.id, ctx);
  }, [draft, data, recipe]);

  const lineCost = new Map(cost.lines.map((l) => [l.lineId, l.cost]));
  const lineIssue = new Map(
    cost.status === 'incomplete' ? cost.issues.filter((i) => i.lineId).map((i) => [i.lineId!, i]) : [],
  );
  const suggested =
    cost.status === 'ok' ? suggestedSellPriceCents(cost.costPerPortion, data.settings.targetFoodCostPct, data.settings.gstRegistered) : null;

  const pool = useMemo(() => {
    const term = search.trim().toLowerCase();
    const graph = new Map(data.recipes.map((r) => [r.id, r]));
    const matches = (name: string) => !term || name.toLowerCase().includes(term);
    return {
      ingredients: data.ingredients.filter((i) => !i.archived && matches(i.name)),
      preps: data.recipes.filter(
        (r) =>
          r.type === 'prep' &&
          !r.archived &&
          r.id !== recipe.id &&
          r.yieldUnit &&
          matches(r.name) &&
          !wouldCreateCycle(graph, recipe.id, r.id),
      ),
    };
  }, [search, data, recipe.id]);

  const addLine = (line: Omit<DraftLine, 'key' | 'quantity'>, at?: number) => {
    const key = crypto.randomUUID();
    focusLine.current = key;
    setPoolOpen(false);
    change((d) => {
      const lines = [...d.lines];
      lines.splice(at ?? lines.length, 0, { ...line, key, quantity: '' });
      return { ...d, lines };
    });
  };

  // A line just added is ready for its quantity.
  useEffect(() => {
    if (!focusLine.current) return;
    const field = document.getElementById(`qty-${focusLine.current}`);
    focusLine.current = null;
    field?.focus();
    field?.scrollIntoView({ block: 'center' });
  }, [draft.lines]);
  const editLine = (key: string, patch: Partial<DraftLine>) =>
    change((d) => ({ ...d, lines: d.lines.map((l) => (l.key === key ? { ...l, ...patch } : l)) }));
  const removeLine = (key: string) => change((d) => ({ ...d, lines: d.lines.filter((l) => l.key !== key) }));

  // Everything the pool can offer, keyed by its drag id, so a tap and a drop add the same line.
  const poolItems = useMemo(() => {
    const items = new Map<string, { name: string; line: Omit<DraftLine, 'key' | 'quantity'> }>();
    for (const r of pool.preps) {
      items.set(`${POOL_PREFIX}prep:${r.id}`, { name: r.name, line: { ingredientId: null, subRecipeId: r.id, unit: UNITS[r.yieldUnit!].base } });
    }
    for (const i of pool.ingredients) {
      items.set(`${POOL_PREFIX}ing:${i.id}`, { name: i.name, line: { ingredientId: i.id, subRecipeId: null, unit: i.baseUnit } });
    }
    return items;
  }, [pool]);

  const [dragging, setDragging] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    // Press and hold to pick up on a touch screen, so a normal swipe still scrolls the page.
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setDragging(null);
    if (!over) return;
    const activeId = String(active.id);
    const overIndex = latest.current.lines.findIndex((l) => l.key === over.id);
    const fromPool = poolItems.get(activeId);
    if (fromPool) return addLine(fromPool.line, overIndex >= 0 ? overIndex : undefined);
    const from = latest.current.lines.findIndex((l) => l.key === activeId);
    if (from >= 0 && overIndex >= 0 && from !== overIndex) {
      change((d) => ({ ...d, lines: arrayMove(d.lines, from, overIndex) }));
    }
  };

  const draggingName = dragging
    ? (poolItems.get(dragging)?.name ??
      (() => {
        const line = draft.lines.find((l) => l.key === dragging);
        return (line?.ingredientId && ingredientById.get(line.ingredientId)?.name) || (line?.subRecipeId && recipeById.get(line.subRecipeId)?.name) || '';
      })())
    : '';

  return (
    <DndContext
      id="recipe-builder"
      sensors={sensors}
      collisionDetection={collisions}
      onDragStart={({ active }) => setDragging(String(active.id))}
      onDragCancel={() => setDragging(null)}
      onDragEnd={onDragEnd}
    >
    <div className="grid gap-6 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
      <section
        className={`${card} lg:order-1 lg:sticky lg:top-4 lg:block lg:max-h-[calc(100vh-2rem)] lg:self-start lg:overflow-y-auto ${
          poolOpen ? 'fixed inset-0 z-[70] overflow-y-auto rounded-none pb-24' : 'hidden'
        }`}
        aria-label="Ingredient pool"
      >
        <div className="flex items-center justify-between gap-3">
          <h2 className={h2}>Add to recipe</h2>
          <button type="button" onClick={() => setPoolOpen(false)} className={`${secondary} lg:hidden`}>Close</button>
        </div>
        <p className={`mt-1 ${muted}`}>
          <span className="lg:hidden">Tap an ingredient to add it.</span>
          <span className="hidden lg:inline">Tap to add, or drag into the recipe.</span>
        </p>
        <label htmlFor="pool-search" className="sr-only">Search ingredients</label>
        <input
          id="pool-search"
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search…"
          className={`mt-2 ${input}`}
        />
        {pool.preps.length > 0 && (
          <>
            <p className={`mt-3 ${muted} font-semibold uppercase tracking-wide`}>Preps</p>
            <ul className="mt-1 space-y-1">
              {pool.preps.map((r) => (
                <PoolItem key={r.id} id={`${POOL_PREFIX}prep:${r.id}`} name={r.name} onAdd={() => addLine(poolItems.get(`${POOL_PREFIX}prep:${r.id}`)!.line)} />
              ))}
            </ul>
          </>
        )}
        <p className={`mt-3 ${muted} font-semibold uppercase tracking-wide`}>Ingredients</p>
        {pool.ingredients.length === 0 ? (
          <p className={`mt-1 ${muted}`}>
            Nothing found. <Link href="/ingredients" className="font-semibold text-mazcina-wood underline">Add an ingredient</Link>
          </p>
        ) : (
          <ul className="mt-1 space-y-1">
            {pool.ingredients.map((i) => (
              <PoolItem key={i.id} id={`${POOL_PREFIX}ing:${i.id}`} name={i.name} onAdd={() => addLine(poolItems.get(`${POOL_PREFIX}ing:${i.id}`)!.line)} />
            ))}
          </ul>
        )}
      </section>

      <div className="space-y-6 lg:order-2">
        <section className={card}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className={h2}>Recipe</h2>
            <SaveBadge
              state={save}
              onRetry={flush}
              onKeepMine={keepMine}
              onConfirmLines={() => {
                dirty.current = true;
                void flush();
              }}
            />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="col-span-2 sm:col-span-4">
              <label htmlFor="recipe-name" className={label}>Name</label>
              <input id="recipe-name" value={draft.name} maxLength={120} onChange={(e) => change((d) => ({ ...d, name: e.target.value }))} className={input} />
            </div>
            <div>
              <label htmlFor="recipe-type" className={label}>Kind</label>
              <select id="recipe-type" value={draft.type} onChange={(e) => change((d) => ({ ...d, type: e.target.value as Draft['type'] }))} className={input}>
                <option value="dish">Dish</option>
                <option value="prep">Prep (sauce, stock, mix)</option>
              </select>
            </div>
            <div>
              <label htmlFor="recipe-portions" className={label}>Portions</label>
              <input id="recipe-portions" inputMode="decimal" value={draft.portions} onChange={(e) => change((d) => ({ ...d, portions: e.target.value }))} className={input} />
            </div>
            <div>
              <label htmlFor="recipe-yield" className={label}>Batch makes{draft.type === 'dish' ? ' (optional)' : ''}</label>
              <input id="recipe-yield" inputMode="decimal" value={draft.yieldQuantity} onChange={(e) => change((d) => ({ ...d, yieldQuantity: e.target.value }))} className={input} />
            </div>
            <div>
              <label htmlFor="recipe-yield-unit" className={label}>Unit</label>
              <select id="recipe-yield-unit" value={draft.yieldUnit} onChange={(e) => change((d) => ({ ...d, yieldUnit: e.target.value as Unit }))} className={input}>
                {(Object.keys(UNITS) as Unit[]).map((u) => (
                  <option key={u} value={u}>{u}</option>
                ))}
              </select>
            </div>
          </div>
          {draft.yieldQuantity.trim() !== '' && (
            <label className="mt-3 flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={draft.yieldEstimated}
                onChange={(e) => change((d) => ({ ...d, yieldEstimated: e.target.checked }))}
                className="mt-0.5 size-6 shrink-0 accent-mazcina-wood"
              />
              <span>
                Estimated, not weighed yet.{' '}
                <span className={muted}>Untick after weighing a finished batch and typing the real amount; costs that use it then stop showing as estimates.</span>
              </span>
            </label>
          )}
        </section>

        <LinesZone active={!!dragging && dragging.startsWith(POOL_PREFIX)}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className={h2}>Ingredients in this recipe</h2>
            <button type="button" onClick={() => setPoolOpen(true)} className={`${primary} lg:hidden`}>+ Add ingredient</button>
          </div>
          {draft.lines.length === 0 ? (
            <p className={`mt-2 ${muted}`}>
              Empty. <span className="lg:hidden">Tap “+ Add ingredient”.</span>
              <span className="hidden lg:inline">Tap an ingredient in “Add to recipe”, or drag it here.</span>
            </p>
          ) : (
            <SortableContext items={draft.lines.map((l) => l.key)} strategy={verticalListSortingStrategy}>
            <ul className="mt-2 divide-y divide-gray-100">
              {draft.lines.map((line, index) => {
                const ingredient = line.ingredientId ? ingredientById.get(line.ingredientId) : undefined;
                const sub = line.subRecipeId ? recipeById.get(line.subRecipeId) : undefined;
                const name = ingredient?.name ?? sub?.name ?? 'Missing item';
                const units = ingredient
                  ? unitsForIngredient(ingredient)
                  : sub?.yieldUnit
                    ? unitsForDimension(sub.yieldUnit)
                    : [line.unit];
                const value = lineCost.get(line.key);
                const issue = lineIssue.get(line.key);
                return (
                  <SortableLine key={line.key} id={line.key} name={name}>
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-semibold">
                        {name}
                        {sub && <span className={`ml-2 ${muted}`}>prep</span>}
                      </p>
                      <p className="font-semibold tabular-nums">{value ? money(value) : '—'}</p>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <label htmlFor={`qty-${line.key}`} className="sr-only">Quantity of {name}</label>
                      <input
                        id={`qty-${line.key}`}
                        inputMode="decimal"
                        value={line.quantity}
                        placeholder="Qty"
                        onChange={(e) => editLine(line.key, { quantity: e.target.value })}
                        className={`${input} max-w-32`}
                      />
                      <label htmlFor={`unit-${line.key}`} className="sr-only">Unit for {name}</label>
                      <select
                        id={`unit-${line.key}`}
                        value={line.unit}
                        onChange={(e) => editLine(line.key, { unit: e.target.value as Unit })}
                        className={`${input} max-w-24`}
                      >
                        {(units.includes(line.unit) ? units : [line.unit, ...units]).map((u) => (
                          <option key={u} value={u}>{u}</option>
                        ))}
                      </select>
                      <button type="button" onClick={() => removeLine(line.key)} className={`${secondary} ml-auto`} aria-label={`Remove ${name} (line ${index + 1})`}>
                        Remove
                      </button>
                    </div>
                    {issue && line.quantity.trim() !== '' && <p className={`mt-2 ${badgeWarn}`}>{issueText(issue)}</p>}
                    {!positive(line.quantity) && (
                      <p className={`mt-1 ${muted}`}>{line.quantity.trim() ? 'Type a number, like 150 or 0.5' : 'Type how much goes in one batch'}</p>
                    )}
                  </SortableLine>
                );
              })}
            </ul>
            </SortableContext>
          )}
          {draft.lines.length > 0 && (
            <button type="button" onClick={() => setPoolOpen(true)} className={`mt-3 w-full ${secondary} lg:hidden`}>+ Add another ingredient</button>
          )}
        </LinesZone>

        <section className={card} aria-live="polite">
          <h2 className={h2}>Cost</h2>
          {cost.status === 'ok' ? (
            <dl className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div>
                <dt className={muted}>Per portion</dt>
                <dd className="text-2xl font-bold tabular-nums">{money(cost.costPerPortion)}</dd>
              </div>
              <div>
                <dt className={muted}>Whole batch</dt>
                <dd className="text-2xl font-bold tabular-nums">{money(cost.batchCost)}</dd>
              </div>
              {suggested !== null && (
                <div className="col-span-2 sm:col-span-1">
                  <dt className={muted}>Menu price at {plain(data.settings.targetFoodCostPct)}% food cost</dt>
                  <dd className="text-2xl font-bold tabular-nums">{moneyFromCents(suggested)}</dd>
                </div>
              )}
            </dl>
          ) : null}
          {cost.status === 'ok' && (cost.estimates.length > 0 || (draft.yieldEstimated && draft.yieldQuantity.trim() !== '')) && (
            <p className={`mt-3 ${badgeWarn}`}>
              Estimate:{' '}
              {[...(draft.yieldEstimated && draft.yieldQuantity.trim() !== '' ? ['this batch'] : []), ...cost.estimates].join(', ')}{' '}
              {cost.estimates.length + (draft.yieldEstimated ? 1 : 0) === 1 ? 'has' : 'have'} an estimated yield. Weigh a finished batch to make the cost exact.
            </p>
          )}
          {cost.status !== 'ok' && (
            <div className="mt-2">
              <p className={badgeWarn}>Incomplete: no cost shown until this is fixed</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                {[...new Set(cost.issues.map(issueText))].map((message) => (
                  <li key={message}>{message}</li>
                ))}
              </ul>
            </div>
          )}
          {cost.status === 'ok' && cost.asNeeded.length > 0 && (
            <p className={`mt-3 ${badgeWarn}`}>
              Not in this cost, used as needed: {cost.asNeeded.join(', ')}. Weigh a typical amount and add it as a line to include it.
            </p>
          )}
          <p className={`mt-3 ${muted}`}>Costs are before GST, from the latest supplier prices.</p>
        </section>

        <section className={card}>
          <label htmlFor="recipe-as-needed" className={h2}>Used as needed</label>
          <p className={`mt-1 ${muted}`}>Salt, frying oil and the like with no set amount. One per line. They are listed with the cost but not counted in it.</p>
          <textarea
            id="recipe-as-needed"
            value={draft.asNeeded}
            rows={Math.min(12, Math.max(2, draft.asNeeded.split('\n').length + 1))}
            onChange={(e) => change((d) => ({ ...d, asNeeded: e.target.value }))}
            className={`mt-2 ${input}`}
          />
        </section>

        <section className={card}>
          <label htmlFor="recipe-notes" className={h2}>Method and notes</label>
          <textarea
            id="recipe-notes"
            value={draft.notes}
            maxLength={12000}
            rows={Math.min(30, Math.max(4, draft.notes.split('\n').length + 1))}
            onChange={(e) => change((d) => ({ ...d, notes: e.target.value }))}
            className={`mt-2 ${input}`}
          />
        </section>
      </div>
    </div>
    <DragOverlay dropAnimation={null}>
      {dragging && draggingName ? (
        <div className="rounded-sm border-2 border-mazcina-wood bg-white px-3 py-2.5 font-semibold text-mazcina-wood shadow-xl">{draggingName}</div>
      ) : null}
    </DragOverlay>
    </DndContext>
  );
}

function PoolItem({ id, name, onAdd }: { id: string; name: string; onAdd: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id });
  // Keyboard users add with Enter or Space (a normal button press), so the drag
  // keyboard handler is left off here; it is on the line handles instead.
  const pointer = { ...listeners };
  delete pointer.onKeyDown;
  return (
    <li>
      <button
        ref={setNodeRef}
        type="button"
        onClick={onAdd}
        {...pointer}
        aria-roledescription={attributes['aria-roledescription']}
        className={`flex min-h-11 w-full touch-manipulation select-none items-center justify-between rounded-sm px-3 text-left font-semibold hover:bg-mazcina-wood/10 active:bg-mazcina-wood/20 ${isDragging ? 'opacity-40' : ''}`}
      >
        {name} <span aria-hidden="true" className="text-xl text-mazcina-wood">+</span>
      </button>
    </li>
  );
}

function LinesZone({ active, children }: { active: boolean; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: LINES_ZONE });
  return (
    <section
      ref={setNodeRef}
      className={`${card} transition-shadow ${active ? (isOver ? 'ring-2 ring-mazcina-wood' : 'outline-2 outline-dashed outline-mazcina-wood/40') : ''}`}
    >
      {children}
    </section>
  );
}

function SortableLine({ id, name, children }: { id: string; name: string; children: ReactNode }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging, isOver } = useSortable({ id });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={`flex gap-2 bg-white py-3 ${isDragging ? 'relative z-10 opacity-60 shadow-lg' : ''} ${isOver && !isDragging ? 'border-t-2 border-t-mazcina-wood' : ''}`}
    >
      <button
        ref={setActivatorNodeRef}
        type="button"
        {...attributes}
        {...listeners}
        aria-label={`Move ${name}`}
        className="grid min-h-11 w-11 shrink-0 cursor-grab touch-none place-items-center self-start rounded-sm text-mazcina-green hover:bg-mazcina-wood/10 hover:text-mazcina-wood active:cursor-grabbing"
      >
        <svg aria-hidden="true" viewBox="0 0 16 24" className="h-6 w-4 fill-current">
          <circle cx="4" cy="5" r="2" /><circle cx="12" cy="5" r="2" />
          <circle cx="4" cy="12" r="2" /><circle cx="12" cy="12" r="2" />
          <circle cx="4" cy="19" r="2" /><circle cx="12" cy="19" r="2" />
        </svg>
      </button>
      <div className="min-w-0 flex-1">{children}</div>
    </li>
  );
}


function SaveBadge({
  state,
  onRetry,
  onKeepMine,
  onConfirmLines,
}: {
  state: SaveState;
  onRetry: () => void;
  onKeepMine: (conflict: RecipeConflict) => void;
  onConfirmLines: () => void;
}) {
  if (state.kind === 'saved') {
    return state.pending ? (
      <p role="status" className={badgeWarn}>Saved, but {state.pending}</p>
    ) : (
      <p role="status" className={badgeOk}>Saved</p>
    );
  }
  if (state.kind === 'saving' || state.kind === 'waiting') return <p role="status" className={badgeWarn}>Saving…</p>;
  if (state.kind === 'incomplete') return <p role="status" className={badgeWarn}>Not saved yet: {state.reason}</p>;
  if (state.kind === 'leftover') {
    return (
      <div role="status" className="flex flex-wrap items-center gap-2">
        <p className={badgeWarn}>
          Last time {state.count === 1 ? 'an ingredient was' : `${state.count} ingredients were`} added without a quantity and not saved. Add
          {state.count === 1 ? ' it' : ' them'} again if needed.
        </p>
        <button type="button" onClick={onConfirmLines} className={secondary}>The list is complete</button>
      </div>
    );
  }
  if (state.kind === 'conflict') {
    const { by, at } = state.conflict;
    return (
      <div role="alert" className="w-full rounded-md border-l-4 border-red-600 bg-red-50 p-3">
        <p className="text-sm font-semibold text-red-800">
          {by} changed this recipe on {whenFormat.format(new Date(at))}, so your last change is not saved yet.
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <button type="button" onClick={() => onKeepMine(state.conflict)} className={secondary}>Keep my version</button>
          <button type="button" onClick={() => window.location.reload()} className={secondary}>Show theirs</button>
        </div>
      </div>
    );
  }
  return (
    <div role="alert" className="flex flex-wrap items-center gap-2">
      <p className="text-sm font-semibold text-red-700">Not saved: {state.message}</p>
      <button type="button" onClick={onRetry} className={secondary}>Retry</button>
    </div>
  );
}
