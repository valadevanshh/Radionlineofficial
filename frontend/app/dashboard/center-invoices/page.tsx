'use client';

import React, { useEffect, useState } from 'react';
import { Building2, RefreshCw, Receipt } from 'lucide-react';
import { ApiClient } from '@/lib/api-client';
import { RadiologyStore } from '@/lib/radiology-store';

export default function CenterInvoicesPage() {
  const [invoices, setInvoices] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [pricing, setPricing] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [inv, pr] = await Promise.all([
        ApiClient.getInvoices({ partyType: 'center' }),
        ApiClient.getPricing().catch(() => null),
      ]);
      setInvoices(inv);
      setPricing(pr);
      if (inv.length && !selected) {
        const d = await ApiClient.getInvoice(inv[0].id);
        setSelected(d);
      }
    } catch (e: any) {
      setError(e?.message || 'Failed to load center invoices');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const statusBadge = (s: string) => {
    const base = 'px-2 py-0.5 rounded text-[10px] font-bold uppercase';
    if (s === 'paid') return `${base} bg-emerald-50 text-emerald-700 border border-emerald-200`;
    if (s === 'overdue') return `${base} bg-rose-50 text-rose-700 border border-rose-200`;
    return `${base} bg-amber-50 text-amber-700 border border-amber-200`;
  };

  return (
    <div className="h-full overflow-auto p-4 sm:p-6 bg-[var(--bg)]">
      <div className="max-w-5xl mx-auto space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-[#009ef7]/10 text-[#009ef7] flex items-center justify-center">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-base font-bold text-slate-900">Center Invoices</h1>
              <p className="text-[11px] text-slate-500 font-mono">
                ₹{pricing?.center?.firstStudy ?? 30} first study · ₹{pricing?.center?.additionalStudy ?? 15} each
                additional · monthly view
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={load}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-bold"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
        </div>

        {error && <div className="text-xs text-rose-700 bg-rose-50 border border-rose-100 rounded-lg px-3 py-2">{error}</div>}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-1 rounded-xl border border-slate-200 bg-white overflow-hidden">
            <div className="px-3 py-2 border-b border-slate-100 text-[10px] font-bold uppercase text-slate-500">
              Monthly invoices
            </div>
            {loading ? (
              <div className="p-6 text-center text-xs text-slate-400">Loading…</div>
            ) : invoices.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400 italic">No invoices yet</div>
            ) : (
              <ul>
                {invoices.map((inv) => (
                  <li key={inv.id}>
                    <button
                      type="button"
                      onClick={async () => setSelected(await ApiClient.getInvoice(inv.id))}
                      className={`w-full text-left px-3 py-2.5 border-b border-slate-50 hover:bg-slate-50 ${
                        selected?.id === inv.id ? 'bg-sky-50' : ''
                      }`}
                    >
                      <div className="flex justify-between items-center gap-2">
                        <span className="font-mono text-xs font-bold">{inv.billingPeriod}</span>
                        <span className={statusBadge(inv.status)}>{inv.status}</span>
                      </div>
                      <div className="mt-0.5 font-mono text-sm font-bold text-slate-900">₹{inv.totalAmount}</div>
                      {inv.locked && <div className="text-[10px] text-slate-400">Locked</div>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="md:col-span-2 rounded-xl border border-slate-200 bg-white p-4">
            {!selected ? (
              <div className="h-48 flex items-center justify-center text-xs text-slate-400 italic">
                Select a month
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <Receipt className="w-4 h-4 text-[#009ef7]" />
                      <h2 className="font-bold text-slate-900">{selected.partyName}</h2>
                    </div>
                    <div className="text-[11px] font-mono text-slate-500 mt-0.5">
                      Period {selected.billingPeriod} · <span className={statusBadge(selected.status)}>{selected.status}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xl font-bold font-mono">₹{selected.totalAmount}</div>
                    <div className="text-[10px] text-slate-400 uppercase">{selected.currency}</div>
                  </div>
                </div>

                <div className="text-[10px] font-bold uppercase text-slate-500">Per-day study breakdown</div>
                {(selected.byDay || []).length === 0 ? (
                  <div className="text-xs text-slate-400 italic">No line items</div>
                ) : (
                  <div className="space-y-2 max-h-[55vh] overflow-auto">
                    {selected.byDay.map((day: any) => (
                      <div key={day.serviceDate} className="rounded-lg border border-slate-100 overflow-hidden">
                        <div className="flex justify-between bg-slate-50 px-3 py-1.5 text-xs font-bold">
                          <span>{day.serviceDate}</span>
                          <span className="font-mono">₹{day.dayTotal}</span>
                        </div>
                        <table className="w-full text-[11px]">
                          <thead>
                            <tr className="text-slate-400 text-left">
                              <th className="px-3 py-1">Patient</th>
                              <th className="px-2 py-1">Study</th>
                              <th className="px-2 py-1">Modality</th>
                              <th className="px-2 py-1 text-right">₹</th>
                            </tr>
                          </thead>
                          <tbody>
                            {day.studies.map((s: any) => (
                              <tr key={s.id} className="border-t border-slate-50">
                                <td className="px-3 py-1.5">{s.patientName}</td>
                                <td className="px-2 py-1.5">
                                  #{s.studyIndex} {s.bodyPart}
                                </td>
                                <td className="px-2 py-1.5">{s.modality}</td>
                                <td className="px-2 py-1.5 text-right font-mono font-bold">₹{s.amount}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
