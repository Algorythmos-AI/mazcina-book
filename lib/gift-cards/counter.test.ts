import { readFileSync } from 'node:fs';
import jsQR from 'jsqr';
import { PNG } from 'pngjs';
import QRCode from 'qrcode';
import { describe, expect, it } from 'vitest';
import { COUNTER_QR_OPTIONS, COUNTER_URL } from './counter';

// The counter sign is printed. If this fails, the QR in the restaurant no longer matches the code.
describe('printed counter QR', () => {
  it('opens the permanent short link', () => {
    expect(COUNTER_URL).toBe('https://mazcinarestobar.com.au/gift');
  });

  it('the committed PNG scans to that link', () => {
    const png = PNG.sync.read(readFileSync('public/counter-sign/gift-card-qr.png'));
    expect(jsQR(new Uint8ClampedArray(png.data), png.width, png.height)?.data).toBe(COUNTER_URL);
  });

  it('the committed SVG is exactly what the frozen settings produce', async () => {
    const svg = await QRCode.toString(COUNTER_URL, { ...COUNTER_QR_OPTIONS, type: 'svg' });
    expect(readFileSync('public/counter-sign/gift-card-qr.svg', 'utf8')).toBe(svg);
  });
});
