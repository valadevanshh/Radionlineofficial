'use client';

import React from 'react';
import { cn } from '@/lib/cn';
import { normalizeStatus, statusLabel, type StatusKind } from '@/lib/status';

export interface StatusBadgeProps {
  status?: string | null;
  className?: string;
}

const tone: Record<StatusKind, string> = {
  pending: 'bg-[var(--rn-warning-muted)] text-[var(--rn-warning)] border-[var(--rn-warning)]/20',
  in_review: 'bg-[var(--rn-info-muted)] text-[var(--rn-info)] border-[var(--rn-info)]/20',
  draft: 'bg-[var(--rn-warning-muted)] text-[var(--rn-warning)] border-[var(--rn-warning)]/20',
  signed: 'bg-[var(--rn-success-muted)] text-[var(--rn-success)] border-[var(--rn-success)]/20',
  partial: 'bg-[var(--rn-warning-muted)] text-[var(--rn-warning)] border-[var(--rn-warning)]/20',
  claimed: 'bg-[var(--rn-info-muted)] text-[var(--rn-info)] border-[var(--rn-info)]/20',
  unclaimed: 'bg-[var(--rn-surface-muted)] text-[var(--rn-text-secondary)] border-[var(--rn-border)]',
  approved: 'bg-[var(--rn-success-muted)] text-[var(--rn-success)] border-[var(--rn-success)]/20',
  rejected: 'bg-[var(--rn-danger-muted)] text-[var(--rn-danger)] border-[var(--rn-danger)]/20',
  paid: 'bg-[var(--rn-success-muted)] text-[var(--rn-success)] border-[var(--rn-success)]/20',
  overdue: 'bg-[var(--rn-danger-muted)] text-[var(--rn-danger)] border-[var(--rn-danger)]/20',
  unknown: 'bg-[var(--rn-surface-muted)] text-[var(--rn-text-secondary)] border-[var(--rn-border)]',
};

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const kind = normalizeStatus(status);
  return (
    <span
      className={cn(
        'inline-flex h-6 items-center rounded-[var(--rn-radius-control)] border px-2 text-[12px] font-semibold leading-none',
        tone[kind],
        className
      )}
    >
      {statusLabel(status)}
    </span>
  );
}
