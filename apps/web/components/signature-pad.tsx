"use client";

import { useRef, useEffect, useState, useImperativeHandle, forwardRef, useCallback } from "react";

// Phase 6 SignaturePad — dependency-free HTML5 canvas. Captures pointer
// events (mouse + touch via Pointer Events), renders strokes, exports
// `data:image/png;base64,...` via getDataURL. The signature is only sent
// when the user enables and signs — the parent owns the approve-on-click
// handoff.

export interface SignaturePadHandle {
  /** Returns the data URL with all strokes rendered, or null if empty. */
  exportDataUrl: () => string | null;
  /** Wipe the canvas. */
  clear: () => void;
  /** True if the canvas has any drawing on it. */
  isEmpty: () => boolean;
}

interface SignaturePadProps {
  /** Tailwind/utility classes for the canvas element itself. */
  className?: string;
  /** Pixel height of the canvas; default 220. Width fills the container. */
  height?: number;
  /** Stroke color (defaults to high-contrast for both themes). */
  stroke?: string;
  /** Background color (defaults to surface-2 in dark + light). */
  background?: string;
  /** Notify after every stroke so the parent can toggle a Submit button. */
  onChange?: (isEmpty: boolean) => void;
}

function isDark(): boolean {
  if (typeof document === "undefined") return true;
  // Default to dark when no explicit `data-theme` attribute is set on <html>.
  return document.documentElement.getAttribute("data-theme") !== "light";
}

export const SignaturePad = forwardRef<SignaturePadHandle, SignaturePadProps>(
  function SignaturePad({ className, height = 220, stroke = "#111827", background, onChange }, ref) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const drawingRef = useRef<boolean>(false);
    const lastPtRef = useRef<{ x: number; y: number } | null>(null);
    const dirtyRef = useRef<boolean>(false);
    const [, force] = useState(0);

    const bgColor = background ?? (isDark() ? "#1f2937" : "#ffffff");

    // Wire the canvas: hi-DPI sizing so strokes render crisp on retina.
    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.scale(dpr, dpr);
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, rect.width, rect.height);
      ctx.lineWidth = 2.5;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = stroke;
    }, [bgColor, stroke]);

    const emitChange = useCallback(() => {
      onChange?.(!dirtyRef.current);
    }, [onChange]);

    const getPoint = (e: PointerEvent | React.PointerEvent): { x: number; y: number } => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0 };
      const rect = canvas.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };

    const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
      drawingRef.current = true;
      lastPtRef.current = getPoint(e);
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    };

    const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!drawingRef.current) return;
      const ctx = canvasRef.current?.getContext("2d");
      if (!ctx) return;
      const p = getPoint(e);
      const last = lastPtRef.current;
      if (!last) {
        lastPtRef.current = p;
        return;
      }
      ctx.beginPath();
      ctx.moveTo(last.x, last.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      lastPtRef.current = p;
      if (!dirtyRef.current) {
        dirtyRef.current = true;
        emitChange();
        force((n) => n + 1);
      }
    };

    const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
      drawingRef.current = false;
      lastPtRef.current = null;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    };

    const clearCanvas = useCallback(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, rect.width, rect.height);
      dirtyRef.current = false;
      emitChange();
      force((n) => n + 1);
    }, [bgColor, emitChange]);

    useImperativeHandle(ref, () => ({
      exportDataUrl: () => {
        const canvas = canvasRef.current;
        if (!canvas || !dirtyRef.current) return null;
        return canvas.toDataURL("image/png");
      },
      clear: () => clearCanvas(),
      isEmpty: () => !dirtyRef.current,
    }));

    return (
      <canvas
        ref={canvasRef}
        height={height}
        className={className ?? "w-full rounded-lg border border-border bg-surface-200 touch-none cursor-crosshair"}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        onPointerCancel={onPointerUp}
      />
    );
  },
);
