"use client";

import { useEffect, useState } from "react";
import type { InvoiceStatus } from "@/lib/paypal";

type Props = { initial: InvoiceStatus; email: string; onNew: () => void };

const LABEL: Record<string, { text: string; tone: string }> = {
  SENT: { text: "Sent — waiting for payment", tone: "bg-amber-50 text-amber-900 border-amber-200" },
  UNPAID: { text: "Sent — waiting for payment", tone: "bg-amber-50 text-amber-900 border-amber-200" },
  PAID: { text: "Paid", tone: "bg-green-50 text-green-900 border-green-200" },
  MARKED_AS_PAID: { text: "Paid", tone: "bg-green-50 text-green-900 border-green-200" },
  PARTIALLY_PAID: { text: "Partially paid", tone: "bg-amber-50 text-amber-900 border-amber-200" },
  CANCELLED: { text: "Cancelled", tone: "bg-gray-50 text-gray-700 border-gray-200" },
};

export function SentStep({ initial, email, onNew }: Props) {
  const [invoice, setInvoice] = useState(initial);
  const [checking, setChecking] = useState(false);
  const [copied, setCopied] = useState(false);
  const paid = invoice.status === "PAID" || invoice.status === "MARKED_AS_PAID";

  async function refresh() {
    setChecking(true);
    try {
      const res = await fetch(`/api/invoices/${invoice.id}`);
      if (res.ok) setInvoice(await res.json());
    } finally {
      setChecking(false);
    }
  }

  // Poll quietly until the customer pays.
  useEffect(() => {
    if (paid) return;
    const t = setInterval(refresh, 8000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paid, invoice.id]);

  const label = LABEL[invoice.status] ?? { text: invoice.status, tone: "bg-gray-50 text-gray-700 border-gray-200" };

  return (
    <div>
      <div className={`rounded-xl border px-4 py-3 ${label.tone}`} role="status">
        <p className="text-sm font-semibold">{label.text}</p>
        <p className="mt-0.5 text-sm">
          Invoice {invoice.invoiceNumber && `#${invoice.invoiceNumber} `}for ${invoice.amount} went to {email}.
        </p>
      </div>

      {invoice.payUrl && (
        <div className="mt-5">
          <p className="text-sm font-medium text-gray-900">Customer pay link</p>
          <div className="mt-2 flex gap-2">
            <input readOnly value={invoice.payUrl} className="w-full rounded-lg border border-gray-300 bg-gray-50 px-2.5 py-2 font-mono text-xs text-gray-700" />
            <button
              type="button"
              onClick={async () => {
                await navigator.clipboard.writeText(invoice.payUrl);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
              className="shrink-0 rounded-lg border border-gray-300 px-3 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          {!paid && (
            <p className="mt-2 text-xs text-gray-500">
              Open the link and pay with a PayPal sandbox buyer account. This page updates by itself once it&apos;s paid.
            </p>
          )}
        </div>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-3">
        {invoice.payUrl && !paid && (
          <a
            href={invoice.payUrl}
            target="_blank"
            rel="noreferrer"
            className="rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800"
          >
            Open invoice
          </a>
        )}
        <button
          type="button"
          onClick={refresh}
          disabled={checking}
          className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          {checking ? "Checking…" : "Check status"}
        </button>
        <button type="button" onClick={onNew} className="text-sm text-gray-600 underline hover:text-gray-900">
          New invoice
        </button>
      </div>
    </div>
  );
}
