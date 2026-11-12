"use client";

import { useState } from "react";
import type { InvoiceStatus } from "@/lib/paypal";
import { canSend, total, type InvoiceDraft, type InvoiceItem } from "@/lib/schema";

type Props = {
  initial: InvoiceDraft;
  source: "ai" | "example" | "manual" | "mock";
  original?: string;
  onBack: () => void;
  onSent: (invoice: InvoiceStatus) => void;
};

const SOURCE_NOTE: Record<Props["source"], string> = {
  ai: "Drafted by AI from your input. Check every line before sending.",
  example: "Saved AI result for this example. Edit anything before sending.",
  mock: "AI is switched off on this server, so this is a sample draft.",
  manual: "Fill in the customer and at least one item.",
};

const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });
const field =
  "w-full rounded-lg border border-gray-300 px-2.5 py-2 text-sm outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100";

export function ReviewStep({ initial, source, original, onBack, onSent }: Props) {
  const [draft, setDraft] = useState<InvoiceDraft>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const setItem = (i: number, patch: Partial<InvoiceItem>) =>
    setDraft((d) => ({ ...d, items: d.items.map((it, j) => (j === i ? { ...it, ...patch } : it)) }));
  const num = (v: string) => (Number.isFinite(Number(v)) ? Number(v) : 0);

  const emailMissing = draft.customer.email.trim() === "";
  const sendable = canSend(draft) && draft.items.every((it) => it.name.trim() && it.quantity > 0);

  async function send() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draft }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Couldn't send the invoice.");
      onSent(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't send the invoice.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <p className="rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-900">{SOURCE_NOTE[source]}</p>

      {original && (
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer text-gray-600">Original message</summary>
          <p className="mt-2 whitespace-pre-wrap rounded-lg bg-gray-50 p-3 text-gray-700">{original}</p>
        </details>
      )}

      <h2 className="mt-5 text-sm font-semibold text-gray-900">Bill to</h2>
      <div className="mt-2 grid gap-3 sm:grid-cols-2">
        <label className="text-xs text-gray-600">
          Name
          <input
            className={`${field} mt-1`}
            value={draft.customer.name}
            onChange={(e) => setDraft({ ...draft, customer: { ...draft.customer, name: e.target.value } })}
          />
        </label>
        <label className="text-xs text-gray-600">
          Email
          <input
            type="email"
            className={`${field} mt-1 ${emailMissing ? "border-amber-400 bg-amber-50" : ""}`}
            value={draft.customer.email}
            placeholder="customer@example.com"
            onChange={(e) => setDraft({ ...draft, customer: { ...draft.customer, email: e.target.value } })}
          />
          {emailMissing && (
            <span className="mt-1 block text-amber-800">No email was found — add one to send the invoice.</span>
          )}
        </label>
      </div>

      <h2 className="mt-6 text-sm font-semibold text-gray-900">Items</h2>
      <div className="mt-2 space-y-2">
        <div className="hidden grid-cols-[1fr_5rem_7rem_6rem_2rem] gap-2 text-xs text-gray-500 sm:grid">
          <span>Description</span>
          <span>Qty</span>
          <span>Unit price ($)</span>
          <span className="text-right">Amount</span>
          <span />
        </div>
        {draft.items.map((it, i) => (
          <div key={i} className="grid grid-cols-[1fr_4rem_5.5rem_2rem] items-center gap-2 sm:grid-cols-[1fr_5rem_7rem_6rem_2rem]">
            <input
              aria-label={`Item ${i + 1} description`}
              className={field}
              value={it.name}
              placeholder="What you're billing for"
              onChange={(e) => setItem(i, { name: e.target.value })}
            />
            <input
              aria-label={`Item ${i + 1} quantity`}
              type="number"
              min="0"
              step="any"
              className={field}
              value={it.quantity}
              onChange={(e) => setItem(i, { quantity: num(e.target.value) })}
            />
            <input
              aria-label={`Item ${i + 1} unit price`}
              type="number"
              min="0"
              step="0.01"
              className={field}
              value={it.unitPrice}
              onChange={(e) => setItem(i, { unitPrice: num(e.target.value) })}
            />
            <span className="hidden text-right text-sm tabular-nums text-gray-700 sm:block">
              {money(total({ items: [it] }))}
            </span>
            <button
              type="button"
              aria-label={`Remove item ${i + 1}`}
              disabled={draft.items.length === 1}
              onClick={() => setDraft({ ...draft, items: draft.items.filter((_, j) => j !== i) })}
              className="text-lg leading-none text-gray-400 hover:text-red-600 disabled:opacity-30"
            >
              ×
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() => setDraft({ ...draft, items: [...draft.items, { name: "", quantity: 1, unitPrice: 0 }] })}
        className="mt-2 text-sm font-medium text-blue-700 hover:underline"
      >
        + Add item
      </button>

      <label className="mt-5 block text-xs text-gray-600">
        Note to customer
        <input className={`${field} mt-1`} value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} />
      </label>

      <div className="mt-5 flex items-baseline justify-between border-t border-gray-100 pt-4">
        <span className="text-sm text-gray-600">Total due</span>
        <span className="text-2xl font-semibold tabular-nums text-gray-900">{money(total(draft))}</span>
      </div>

      {error && (
        <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={!sendable || busy}
          onClick={send}
          className="rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-gray-300"
        >
          {busy ? "Sending…" : "Send PayPal invoice"}
        </button>
        <button type="button" onClick={onBack} disabled={busy} className="text-sm text-gray-600 underline hover:text-gray-900">
          Start over
        </button>
      </div>
    </div>
  );
}
