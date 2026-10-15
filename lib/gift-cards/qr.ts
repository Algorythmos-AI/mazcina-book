import QRCode from 'qrcode';
import { formatCode } from './codes';

const INK = '#0d2c23';

/** The gift card code as a QR image for the email. It holds only the code, so any scanner shows the same text a customer could type. */
export function codeQrPng(code: string): Promise<Buffer> {
  return QRCode.toBuffer(formatCode(code), { errorCorrectionLevel: 'M', margin: 2, width: 360, color: { dark: INK, light: '#ffffff' } });
}

/** A QR code for a public link, as SVG markup for the printable counter sign. */
export function linkQrSvg(url: string): Promise<string> {
  return QRCode.toString(url, { type: 'svg', errorCorrectionLevel: 'M', margin: 0, color: { dark: INK, light: '#ffffff' } });
}
