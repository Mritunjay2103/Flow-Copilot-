import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";
import { Tooltip } from "./Tooltip";

export type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  tooltip?: string;
};

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  function IconButton(
    { className, label, tooltip, disabled, type = "button", children, ...props },
    ref,
  ) {
    const button = (
      <button
        ref={ref}
        type={type}
        aria-label={label}
        disabled={disabled}
        className={cn(
          "inline-flex h-8 w-8 items-center justify-center rounded-md text-hf-muted transition-colors duration-150",
          "hover:bg-hf-panel-elevated hover:text-hf-text",
          "disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-hf-muted",
          className,
        )}
        {...props}
      >
        {children}
      </button>
    );

    if (!tooltip && !disabled) return button;

    return (
      <Tooltip content={tooltip ?? label} disabled={!tooltip && !disabled}>
        {button}
      </Tooltip>
    );
  },
);
