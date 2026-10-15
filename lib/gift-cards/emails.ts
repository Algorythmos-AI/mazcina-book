import { displayDate } from '@/lib/format';
import { formatCode } from './codes';

interface CardEmail {
  code: string;
  amountCents: number;
  expiresOn: string;
  buyerName: string;
  recipientName: string;
  message: string | null;
}

const dollars = (cents: number) => `$${(cents / 100).toFixed(0)}`;
const esc = (text: string) => text.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);

/** The QR image attached to the card email; the HTML shows it with `cid:` + this. */
export const CODE_QR_ID = 'gift-card-code';

const TERMS = [
  'Show this code, or the QR code in this email, when you pay at Mazcina Resto - Bar, 248 Palmer St, Darlinghurst.',
  'Use it over as many visits as you like until the expiry date. It cannot be exchanged for cash.',
  'Treat the code like cash: anyone who has it can spend it.',
];

function shell(inner: string): string {
  return `<div style="font-family:Arial,Helvetica,sans-serif;background:#f8fafc;padding:24px;color:#0d2c23"><div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:6px;padding:28px"><p style="margin:0;font-family:Georgia,serif;font-style:italic;font-weight:bold;font-size:34px;line-height:1">Mazcina</p><p style="margin:2px 0 20px;font-size:11px;letter-spacing:3px;color:#955412;font-weight:bold">RESTO - BAR</p>${inner}</div></div>`;
}

export function recipientEmail(card: CardEmail) {
  const code = formatCode(card.code);
  const from = card.buyerName === card.recipientName ? '' : ` from ${card.buyerName}`;
  const text = [
    `Hi ${card.recipientName},`,
    '',
    `You have a ${dollars(card.amountCents)} Mazcina gift card${from}.`,
    ...(card.message ? ['', `"${card.message}"`] : []),
    '',
    `Your code: ${code}`,
    `Valid until: ${displayDate(card.expiresOn)}`,
    '',
    ...TERMS,
  ].join('\n');
  const html = shell(
    `<p style="font-size:16px">Hi ${esc(card.recipientName)},</p><p style="font-size:16px">You have a <strong>${dollars(card.amountCents)}</strong> Mazcina gift card${esc(from)}.</p>${card.message ? `<p style="font-size:16px;font-style:italic;border-left:3px solid #955412;padding-left:12px">${esc(card.message)}</p>` : ''}<p style="margin:24px 0 4px;font-size:12px;letter-spacing:2px;color:#2a574c">YOUR CODE</p><p style="margin:0;font-family:'Courier New',monospace;font-size:24px;font-weight:bold;letter-spacing:2px">${code}</p><img src="cid:${CODE_QR_ID}" width="180" height="180" alt="QR code for gift card ${code}" style="display:block;margin:16px 0 0;border:0"><p style="font-size:14px;color:#2a574c">Valid until ${displayDate(card.expiresOn)}</p><ul style="font-size:13px;color:#2a574c;padding-left:18px">${TERMS.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>`,
  );
  return { subject: `Your ${dollars(card.amountCents)} Mazcina gift card`, text, html };
}

/** The buyer's confirmation. It deliberately leaves the code out when the card is for someone else. */
export function receiptEmail(card: CardEmail & { recipientEmail: string }) {
  const text = [
    `Hi ${card.buyerName},`,
    '',
    `Thank you. Your ${dollars(card.amountCents)} Mazcina gift card for ${card.recipientName} has been sent to ${card.recipientEmail}.`,
    `It is valid until ${displayDate(card.expiresOn)}.`,
    '',
    'Stripe sends your payment receipt separately. If the email does not arrive, reply to this message and we will send it again.',
  ].join('\n');
  const html = shell(
    `<p style="font-size:16px">Hi ${esc(card.buyerName)},</p><p style="font-size:16px">Thank you. Your <strong>${dollars(card.amountCents)}</strong> Mazcina gift card for ${esc(card.recipientName)} has been sent to ${esc(card.recipientEmail)}.</p><p style="font-size:14px;color:#2a574c">It is valid until ${displayDate(card.expiresOn)}. If the email does not arrive, reply to this message and we will send it again.</p>`,
  );
  return { subject: 'Your Mazcina gift card has been sent', text, html };
}
