"use client";

import {
  useCallback,
  useRef,
  useState,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { cn } from "@/lib/cn";

/**
 * Lightweight resizable split without extra dependencies.
 * Drag the handle to change the primary pane size along the given axis.
 */
export function ResizablePanel({
  axis = "horizontal",
  initialSize,
  minSize = 180,
  maxSize = 480,
  children,
  handleAriaLabel = "Resize panel",
  className,
  panelClassName,
}: {
  axis?: "horizontal" | "vertical";
  initialSize: number;
  minSize?: number;
  maxSize?: number;
  /** [primary panel, secondary fill] */
  children: [ReactNode, ReactNode];
  handleAriaLabel?: string;
  className?: string;
  panelClassName?: string;
}) {
  const [size, setSize] = useState(initialSize);
  const dragging = useRef(false);
  const start = useRef({ pos: 0, size: initialSize });

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      dragging.current = true;
      start.current = {
        pos: axis === "horizontal" ? event.clientX : event.clientY,
        size,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [axis, size],
  );

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (!dragging.current) return;
      const delta =
        (axis === "horizontal" ? event.clientX : event.clientY) - start.current.pos;
      const next = Math.min(maxSize, Math.max(minSize, start.current.size + delta));
      setSize(next);
    },
    [axis, maxSize, minSize],
  );

  const onPointerUp = useCallback(() => {
    dragging.current = false;
  }, []);

  const isHorizontal = axis === "horizontal";

  return (
    <div
      className={cn(
        "flex min-h-0 min-w-0 flex-1",
        isHorizontal ? "flex-row" : "flex-col",
        className,
      )}
    >
      <div
        className={cn("min-h-0 min-w-0 shrink-0", panelClassName)}
        style={isHorizontal ? { width: size } : { height: size }}
      >
        {children[0]}
      </div>
      <button
        type="button"
        aria-label={handleAriaLabel}
        className={cn(
          "shrink-0 bg-hf-border/80 hover:bg-hf-cyan/60 focus-visible:bg-hf-cyan",
          isHorizontal ? "w-1 cursor-col-resize" : "h-1 cursor-row-resize",
        )}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      />
      <div className="min-h-0 min-w-0 flex-1">{children[1]}</div>
    </div>
  );
}
