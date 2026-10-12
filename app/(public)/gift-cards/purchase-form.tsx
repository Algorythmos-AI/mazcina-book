'use client';

import { useState } from 'react';
import { ActionForm } from '@/components/action-form';
import { input, label, muted } from '@/components/ui';
import { startCheckout } from './actions';

export function PurchaseForm({ presets, min, max }: { presets: number[]; min: number; max: number }) {
  const [amount, setAmount] = useState(String(presets[1] ?? presets[0]));
  const [forMe, setForMe] = useState(false);

  return (
    <ActionForm action={startCheckout} submitLabel="Continue to payment" savedLabel="Opening secure payment…">
      <fieldset>
        <legend className={label}>Amount</legend>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5">
          {[...presets.map(String), 'other'].map((value) => (
            <label
              key={value}
              className={`flex min-h-12 cursor-pointer items-center justify-center rounded-sm border-2 px-3 text-base font-bold ${
                amount === value ? 'border-mazcina-wood bg-mazcina-wood text-white' : 'border-mazcina-wood/40 bg-white text-mazcina-wood'
              }`}
            >
              <input type="radio" name="amount" value={value} checked={amount === value} onChange={() => setAmount(value)} className="sr-only" />
              {value === 'other' ? 'Other' : `$${value}`}
            </label>
          ))}
        </div>
        {amount === 'other' && (
          <div className="mt-3 max-w-48">
            <label htmlFor="customAmount" className={label}>Amount in dollars</label>
            <input id="customAmount" name="customAmount" inputMode="numeric" pattern="[0-9]*" required placeholder={`${min} to ${max}`} className={input} />
          </div>
        )}
      </fieldset>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="buyerName" className={label}>Your name</label>
          <input id="buyerName" name="buyerName" required maxLength={80} autoComplete="name" className={input} />
        </div>
        <div>
          <label htmlFor="buyerEmail" className={label}>Your email</label>
          <input id="buyerEmail" name="buyerEmail" type="email" inputMode="email" required maxLength={200} autoComplete="email" autoCapitalize="none" className={input} />
        </div>
      </div>

      <label className="mt-4 flex min-h-11 items-center gap-2 text-sm font-semibold">
        <input type="checkbox" name="forMe" checked={forMe} onChange={(e) => setForMe(e.target.checked)} className="size-5 accent-mazcina-wood" />
        Send the gift card to me
      </label>

      {!forMe && (
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="recipientName" className={label}>Who is it for?</label>
            <input id="recipientName" name="recipientName" required maxLength={80} className={input} />
          </div>
          <div>
            <label htmlFor="recipientEmail" className={label}>Their email</label>
            <input id="recipientEmail" name="recipientEmail" type="email" inputMode="email" required maxLength={200} autoCapitalize="none" className={input} />
            <p className={`mt-1 ${muted}`}>The card is emailed here as soon as you pay.</p>
          </div>
        </div>
      )}

      <div className="mt-4">
        <label htmlFor="message" className={label}>Message (optional)</label>
        <textarea id="message" name="message" rows={3} maxLength={300} className={input} />
      </div>

      <label className="mt-4 flex items-start gap-2 text-sm">
        <input type="checkbox" name="terms" required className="mt-0.5 size-5 shrink-0 accent-mazcina-wood" />
        <span>I have read the gift card terms below.</span>
      </label>
    </ActionForm>
  );
}
