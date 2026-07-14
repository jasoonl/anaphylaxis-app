import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Combines class names using clsx and tailwind-merge.
 * This ensures Tailwind classes are properly merged without conflicts.
 *
 * Usage:
 * ```tsx
 * cn("px-4 py-2", isActive && "bg-primary", className)
 * ```
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Converts a "#RRGGBB" hex color to an "rgba(r, g, b, alpha)" string.
 *
 * Needed because our theme colors are exposed as CSS variables holding plain
 * hex strings (e.g. `--color-warning: #F59E0B`), and Tailwind's opacity slash
 * modifier (e.g. `bg-warning/10`) can't mathematically derive percentage alpha
 * from a variable it can't decompose into RGB channels at build time - it
 * silently renders at full opacity instead. Computing rgba() directly in JS
 * from the resolved hex value (via useColors()) sidesteps that entirely.
 */
export function withOpacity(hex: string, alpha: number): string {
  const normalized = hex.replace("#", "");
  const r = parseInt(normalized.substring(0, 2), 16);
  const g = parseInt(normalized.substring(2, 4), 16);
  const b = parseInt(normalized.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
