'use client';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Camera, ScanLine } from 'lucide-react';
import { cn } from '@/lib/cn';
import { CameraScanner } from './camera-scanner';

export interface ScanFieldHandle { focus: () => void }

/**
 * Input for USB / Bluetooth barcode scanners (keyboard-wedge: the scanner "types" the code and
 * presses Enter). Keeps focus so the next scan always lands here, unless the user is working in
 * another field or a dialog. Optional camera scanning for phones / tablets.
 */
export const ScanField = forwardRef<ScanFieldHandle, {
  onScan: (code: string) => void;
  placeholder?: string;
  busy?: boolean;
  keepFocus?: boolean;
  label?: string;
  className?: string;
}>(function ScanField({ onScan, placeholder = 'Scan a barcode or type a code and press Enter', busy, keepFocus = true, label = 'Scan', className }, ref) {
  const input = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState('');
  const [camera, setCamera] = useState(false);
  useImperativeHandle(ref, () => ({ focus: () => input.current?.focus() }));

  const refocus = useCallback(() => {
    if (!keepFocus || camera) return;
    setTimeout(() => {
      const a = document.activeElement as HTMLElement | null;
      const inForm = a && a !== document.body && a !== input.current && (a.matches('input, textarea, select, [contenteditable]') || a.closest('dialog[open]'));
      if (!inForm) input.current?.focus();
    }, 250);
  }, [keepFocus, camera]);

  useEffect(() => { input.current?.focus(); }, []);
  useEffect(() => {
    if (!keepFocus) return;
    const onClick = () => refocus();
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, [keepFocus, refocus]);

  const submit = (code: string) => {
    const c = code.trim();
    if (!c) return;
    setValue('');
    onScan(c);
  };

  return (
    <div className={className}>
      <div className="flex gap-2">
        <label className="relative flex-1">
          <span className="sr-only">{label}</span>
          <ScanLine className={cn('pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2', busy ? 'animate-pulse text-teal' : 'text-muted')} aria-hidden />
          <input
            ref={input}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              // Some scanners send GS (Ctrl+]) between GS1 fields; keep it in the value.
              if (e.key === ']' && e.ctrlKey) { e.preventDefault(); setValue((v) => v + '\x1d'); }
              if (e.key === 'Enter') { e.preventDefault(); submit(value); }
            }}
            onBlur={refocus}
            placeholder={placeholder}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            aria-label={label}
            className="h-12 w-full rounded-xl border-2 border-aqua bg-white pl-11 pr-3 font-mono text-base focus:border-teal focus:outline-none focus:ring-4 focus:ring-teal/15"
          />
        </label>
        <button type="button" onClick={() => setCamera(true)} className="flex h-12 items-center gap-2 rounded-xl border border-line bg-white px-4 text-sm font-semibold hover:bg-aqua-50" aria-label="Scan with camera">
          <Camera className="size-5" aria-hidden /> <span className="hidden sm:inline">Camera</span>
        </button>
      </div>
      {camera && <CameraScanner onClose={() => { setCamera(false); setTimeout(() => input.current?.focus(), 100); }} onDetected={(c) => submit(c)} />}
    </div>
  );
});
