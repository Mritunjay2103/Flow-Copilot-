import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

const variants: Record<ButtonVariant, string> = {
  primary:
    "bg-hf-violet text-hf-text hover:brightness-110 disabled:bg-hf-border disabled:text-hf-muted",
  secondary:
    "bg-hf-panel-elevated text-hf-text border border-hf-border hover:border-hf-cyan/50 disabled:opacity-50",
  ghost: "bg-transparent text-hf-muted hover:text-hf-text hover:bg-hf-panel-elevated disabled:opacity-40",
  danger:
    "bg-hf-destructive/15 text-hf-destructive border border-hf-destructive/40 hover:bg-hf-destructive/25 disabled:opacity-40",
};

const sizes: Record<ButtonSize, string> = {
  sm: "h-8 px-2.5 text-xs gap-1.5",
  md: "h-9 px-3 text-[13px] gap-2",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    { className, variant = "secondary", size = "md", type = "button", ...props },
    ref,
  ) {
    return (
      <button
        ref={ref}
        type={type}
        className={cn(
          "inline-flex items-center justify-center rounded-md font-medium transition-[color,background-color,border-color,filter] duration-150 disabled:cursor-not-allowed",
          variants[variant],
          sizes[size],
          className,
        )}
        {...props}
      />
    );
  },
);
