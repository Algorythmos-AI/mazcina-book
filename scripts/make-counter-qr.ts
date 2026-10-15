/**
 * Writes the counter sign's QR code to public/counter-sign/. Run ONCE; the
 * files are committed and must never change, because they are printed and
 * stuck on the counter. The QR opens COUNTER_URL, a short link on the website
 * that redirects to the gift card page, so the page can move without reprinting.
 * Usage: tsx scripts/make-counter-qr.ts
 */
import { writeFileSync } from 'node:fs';
import QRCode from 'qrcode';
import { COUNTER_QR_OPTIONS, COUNTER_URL } from '../lib/gift-cards/counter';

async function main() {
  writeFileSync('public/counter-sign/gift-card-qr.svg', await QRCode.toString(COUNTER_URL, { ...COUNTER_QR_OPTIONS, type: 'svg' }));
  writeFileSync('public/counter-sign/gift-card-qr.png', await QRCode.toBuffer(COUNTER_URL, { ...COUNTER_QR_OPTIONS, width: 1200 }));
  console.log(`wrote public/counter-sign/gift-card-qr.{svg,png} for ${COUNTER_URL}`);
}

main();
