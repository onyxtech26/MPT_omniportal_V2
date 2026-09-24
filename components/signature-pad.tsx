'use client';

import { useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import SignaturePad from 'signature_pad';

export type SignaturePadHandle = {
  clear: () => void;
  isEmpty: () => boolean;
  /** Raw SVG text — a few KB, not a PNG data URL. See lib/repairs.ts uploadSignature(). */
  toSVG: () => string;
};

// Three gotchas from docs/REPAIR_MODULE_SPEC.md §9, all handled here so
// nobody re-discovers them by shipping a blurry or unusable signature pad:
// (1) touch-action: none, or the page scrolls under the finger on a phone;
// (2) canvas must be sized to devicePixelRatio or it's blurry on any modern
//     screen; (3) resizing a canvas clears it, so this component intentionally
//     does NOT resize after mount — it is sized once, at the size it's given.
export const SignaturePadCanvas = forwardRef<SignaturePadHandle, { width?: number; height?: number }>(
  function SignaturePadCanvas({ width = 400, height = 150 }, ref) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const padRef = useRef<SignaturePad | null>(null);

    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ratio = Math.max(window.devicePixelRatio || 1, 1);
      canvas.width = width * ratio;
      canvas.height = height * ratio;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      const ctx = canvas.getContext('2d');
      ctx?.scale(ratio, ratio);
      padRef.current = new SignaturePad(canvas, { backgroundColor: 'rgb(255,255,255)' });
      return () => padRef.current?.off();
    }, [width, height]);

    useImperativeHandle(ref, () => ({
      clear: () => padRef.current?.clear(),
      isEmpty: () => padRef.current?.isEmpty() ?? true,
      toSVG: () => padRef.current?.toSVG() ?? '',
    }));

    return (
      <canvas
        ref={canvasRef}
        style={{ touchAction: 'none' }} // without this, drawing scrolls the page on a touch device
        className="border border-slate-300 rounded-lg bg-white cursor-crosshair"
      />
    );
  }
);
