"use client";

import { useEffect, useState } from "react";
import { EXAMPLES } from "@/lib/examples";
import type { InvoiceDraft } from "@/lib/schema";
import type { InvoiceStatus } from "@/lib/paypal";
import { InputStep } from "./InputStep";
import { ReviewStep } from "./ReviewStep";
import { SentStep } from "./SentStep";

type Stage =
  | { name: "input" }
  | { name: "review"; draft: InvoiceDraft; source: "ai" | "example" | "manual" | "mock"; original?: string }
  | { name: "sent"; invoice: InvoiceStatus };

const STEPS = ["Paste", "Review", "Sent"];

export function Workspace() {
  const [stage, setStage] = useState<Stage>({ name: "input" });

  // A sent invoice lives in the URL, so the status page survives a reload and can be bookmarked.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("invoice");
    if (!id) return;
    fetch(`/api/invoices/${encodeURIComponent(id)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((invoice: InvoiceStatus | null) => invoice && setStage({ name: "sent", invoice }))
      .catch(() => {});
  }, []);

  function go(next: Stage) {
    const url = next.name === "sent" ? `?invoice=${next.invoice.id}` : window.location.pathname;
    window.history.replaceState(null, "", url);
    setStage(next);
  }

  const index = stage.name === "input" ? 0 : stage.name === "review" ? 1 : 2;

  return (
    <div>
      <ol className="mb-4 flex items-center gap-2 text-sm">
        {STEPS.map((label, i) => (
          <li key={label} className="flex items-center gap-2">
            <span
              className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
                i <= index ? "bg-blue-700 text-white" : "bg-gray-200 text-gray-500"
              }`}
            >
              {i + 1}
            </span>
            <span className={i === index ? "font-medium text-gray-900" : "text-gray-500"}>{label}</span>
            {i < STEPS.length - 1 && <span className="mx-1 h-px w-6 bg-gray-300" />}
          </li>
        ))}
      </ol>

      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
        {stage.name === "input" && (
          <InputStep
            examples={EXAMPLES}
            onDraft={(draft, source, original) => go({ name: "review", draft, source, original })}
          />
        )}
        {stage.name === "review" && (
          <ReviewStep
            initial={stage.draft}
            source={stage.source}
            original={stage.original}
            onBack={() => go({ name: "input" })}
            onSent={(invoice) => go({ name: "sent", invoice })}
          />
        )}
        {stage.name === "sent" && (
          <SentStep key={stage.invoice.id} initial={stage.invoice} onNew={() => go({ name: "input" })} />
        )}
      </section>
    </div>
  );
}
