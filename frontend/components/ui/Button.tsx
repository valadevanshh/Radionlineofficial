'use client';

import React from 'react';
import { cn } from '@/lib/cn';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const variantClass: Record<ButtonVariant, string> = {
  primary:
    'bg-[var(--rn-primary)] text-[var(--rn-primary-foreground)] border-[var(--rn-primary)] hover:bg-[var(--rn-primary-hover)]',
  secondary:
    'bg-[var(--rn-surface)] text-[var(--rn-text)] border-[var(--rn-border)] hover:bg-[var(--rn-surface-muted)]',
  ghost:
    'bg-transparent text-[var(--rn-text-secondary)] border-transparent hover:bg-[var(--rn-surface-muted)] hover:text-[var(--rn-text)]',
  danger:
    'bg-[var(--rn-danger)] text-[var(--rn-danger-foreground)] border-[var(--rn-danger)] hover:brightness-95',
};

const sizeClass: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-[12px]',
  md: 'h-9 px-3.5 text-[13px]',
  lg: 'h-10 px-4 text-[14px]',
};

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  type = 'button',
  disabled,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled}
      className={cn(
        'rn-btn inline-flex items-center justify-center gap-2 rounded-[var(--rn-radius-control)] border font-semibold whitespace-nowrap select-none cursor-pointer transition-colors',
        'focus-visible:outline-none focus-visible:shadow-[0_0_0_3px_var(--rn-primary-muted)]',
        'disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none',
        variantClass[variant],
        sizeClass[size],
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}
