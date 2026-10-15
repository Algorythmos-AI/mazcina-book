'use client';

import jsQR from 'jsqr';
import { useEffect, useRef, useState } from 'react';
import { GIFT_CODE_PATTERN as GIFT_CODE } from '@/lib/gift-cards/code-pattern';
import { secondary } from './ui';


/**
 * Opens the camera and reads the QR code from a gift card email. On a hit it
 * fills the code field it is given and submits that field's form, so a scan
 * goes through exactly the same lookup as a typed code.
 */
export function QrScanner({ inputId }: { inputId: string }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const video = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!open) return;
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d', { willReadFrequently: true });

    const tick = () => {
      if (stopped) return;
      const v = video.current;
      if (v && context && v.readyState >= v.HAVE_ENOUGH_DATA && v.videoWidth > 0) {
        canvas.width = v.videoWidth;
        canvas.height = v.videoHeight;
        context.drawImage(v, 0, 0);
        const frame = context.getImageData(0, 0, canvas.width, canvas.height);
        const found = jsQR(frame.data, frame.width, frame.height, { inversionAttempts: 'dontInvert' });
        const text = found?.data.trim().toUpperCase().replace(/[\s-]/g, '') ?? '';
        if (GIFT_CODE.test(text)) {
          const field = document.getElementById(inputId) as HTMLInputElement | null;
          if (field) {
            field.value = text;
            field.form?.requestSubmit();
          }
          setOpen(false);
          return;
        }
        // Some other QR (a menu, a table number): say so and keep looking, without counting it as a wrong code.
        if (text) setHint('That is not a gift card QR code. Hold up the one in the gift card email.');
      }
      timer = setTimeout(tick, 200);
    };

    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError('This browser cannot use the camera here. Type the code instead.');
        setOpen(false);
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
        if (stopped) return stream.getTracks().forEach((t) => t.stop());
        if (video.current) {
          video.current.srcObject = stream;
          await video.current.play();
        }
        tick();
      } catch {
        setError('The camera could not be opened. Allow camera access for this site, or type the code instead.');
        setOpen(false);
      }
    })();

    return () => {
      stopped = true;
      clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [open, inputId]);

  return (
    <div className="mt-3">
      {open ? (
        <div className="space-y-2">
          <video ref={video} muted playsInline className="aspect-square w-full max-w-sm rounded-md bg-black object-cover" />
          <p className="text-sm text-mazcina-green">Hold the QR code from the customer&apos;s email inside the frame.</p>
          {hint && <p role="status" className="text-sm font-semibold text-amber-800">{hint}</p>}
          <button type="button" onClick={() => setOpen(false)} className={secondary}>
            Stop scanning
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => {
            setError(null);
            setHint(null);
            setOpen(true);
          }}
          className={secondary}
        >
          Scan QR code
        </button>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm font-semibold text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
