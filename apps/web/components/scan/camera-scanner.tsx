'use client';
import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';

interface BarcodeDetectorCtor {
  new (opts: { formats: string[] }): { detect: (src: CanvasImageSource) => Promise<{ rawValue: string }[]> };
  getSupportedFormats: () => Promise<string[]>;
}

/**
 * Camera barcode scanning in the browser (phones / tablets at the counter). Uses the browser's
 * built-in barcode detector where available, otherwise ZXing; both read Code 128, EAN/UPC, QR and
 * DataMatrix (incl. GS1 DataMatrix on lens boxes). Hold the code so it fills most of the frame. The same code
 * then goes through exactly the same lookup as a USB scan.
 */
export function CameraScanner({ onDetected, onClose }: { onDetected: (code: string) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const last = useRef<{ code: string; at: number } | null>(null);

  useEffect(() => {
    let stop: (() => void) | undefined;
    let cancelled = false;
    const accept = (code: string) => {
      const now = Date.now();
      // Ignore the same code seen again within 1.5 s (the camera sees it many times a second).
      if (last.current && last.current.code === code && now - last.current.at < 1500) return;
      last.current = { code, at: now };
      onDetected(code);
    };
    (async () => {
      // 1) Native detector (Chrome / Edge on Android, ChromeOS): reads GS1 DataMatrix reliably.
      const Native = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
      if (Native) {
        try {
          const supported = await Native.getSupportedFormats();
          if (supported.includes('data_matrix')) {
            const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } } });
            if (cancelled || !video.current) { stream.getTracks().forEach((t) => t.stop()); return; }
            video.current.srcObject = stream;
            await video.current.play();
            const detector = new Native({ formats: ['data_matrix', 'qr_code', 'code_128', 'ean_13', 'ean_8', 'upc_a'].filter((f) => supported.includes(f)) });
            let raf = 0;
            const tick = async () => {
              if (cancelled || !video.current) return;
              try {
                const found = await detector.detect(video.current);
                if (found[0]?.rawValue) accept(found[0].rawValue);
              } catch { /* frame not ready */ }
              raf = window.setTimeout(tick, 120) as unknown as number;
            };
            void tick();
            stop = () => { clearTimeout(raf); stream.getTracks().forEach((t) => t.stop()); };
            return;
          }
        } catch { /* fall back to ZXing */ }
      }
      // 2) ZXing in JavaScript (iPhone Safari, desktop browsers).
      try {
        const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([import('@zxing/browser'), import('@zxing/library')]);
        const hints = new Map();
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.CODE_128, BarcodeFormat.DATA_MATRIX, BarcodeFormat.QR_CODE, BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A]);
        const reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 120 });
        if (cancelled || !video.current) return;
        const controls = await reader.decodeFromConstraints({ video: { facingMode: { ideal: 'environment' } } }, video.current, (result) => {
          if (result) accept(result.getText());
        });
        stop = () => controls.stop();
      } catch (e) {
        setError((e as Error).name === 'NotAllowedError' ? 'Camera permission was denied. Allow camera access in the browser settings.' : 'No camera is available on this device.');
      }
    })();
    return () => { cancelled = true; stop?.(); };
  }, [onDetected]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-ink/90" role="dialog" aria-label="Camera scanner">
      <div className="flex items-center justify-between p-4 text-white">
        <p className="text-sm">Point the camera at the barcode. Each code is added once.</p>
        <button onClick={onClose} aria-label="Close camera" className="rounded-full bg-white/10 p-2 hover:bg-white/20"><X className="size-5" /></button>
      </div>
      <div className="relative mx-auto w-full max-w-xl flex-1">
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <video ref={video} className="h-full w-full object-contain" muted playsInline />
        <div className="pointer-events-none absolute inset-x-10 top-1/2 h-40 -translate-y-1/2 rounded-xl border-2 border-teal/80" />
      </div>
      {error && <p className="p-4 text-center text-sm text-white">{error}</p>}
    </div>
  );
}
