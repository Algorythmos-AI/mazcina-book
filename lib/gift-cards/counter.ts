/**
 * The printed counter sign. These values are frozen: the QR made from them is
 * committed in public/counter-sign/ and printed in the restaurant. Changing
 * either breaks the test that guards the committed files.
 */
export const COUNTER_URL = 'https://mazcinarestobar.com.au/gift';

export const COUNTER_QR_OPTIONS = {
  errorCorrectionLevel: 'Q' as const,
  margin: 2,
  color: { dark: '#0d2c23', light: '#ffffff' },
};
