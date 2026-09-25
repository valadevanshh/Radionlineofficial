'use client';

import React from 'react';
import { cn } from '@/lib/cn';

export interface PageHeaderProps {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}

export function PageHeader({ title, subtitle, actions, className }: PageHeaderProps) {
  return (
    <header
      className={cn(
        'flex shrink-0 items-center justify-between gap-3 border-b border-[var(--rn-border)] bg-[var(--rn-surface)] px-4 md:px-6',
        className
      )}
      style={{ height: 'var(--rn-page-header-height)', minHeight: 'var(--rn-page-header-height)' }}
    >
      <div className="min-w-0">
        <h1 className="truncate text-[16px] font-semibold leading-5 text-[var(--rn-text)]">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-0.5 truncate text-[12px] leading-4 text-[var(--rn-text-secondary)]">
            {subtitle}
          </p>
        )}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  );
}
