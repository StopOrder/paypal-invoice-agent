"use client";

import { useRef, useState } from "react";
import type { Example } from "@/lib/examples";
import type { InvoiceDraft } from "@/lib/schema";

type Props = {
  examples: Example[];
  onDraft: (draft: InvoiceDraft, source: "ai" | "example" | "manual" | "mock", original?: string) => void;
};

type Picked = { mimeType: string; base64: string; preview: string; name: string };

/** Downscale in the browser so uploads stay small and fast. */
async function shrink(file: File): Promise<Picked> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const preview = canvas.toDataURL("image/jpeg", 0.85);
  return { mimeType: "image/jpeg", base64: preview.split(",")[1], preview, name: file.name };
}

const EMPTY: InvoiceDraft = {
  customer: { name: "", email: "" },
  items: [{ name: "", quantity: 1, unitPrice: 0 }],
  note: "",
  currency: "USD",
};

export function InputStep({ examples, onDraft }: Props) {
  const [text, setText] = useState("");
  const [image, setImage] = useState<Picked | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  async function pick(file: File | undefined) {
    if (!file) return;
    setError("");
    try {
      setImage(await shrink(file));
    } catch {
      setError("Couldn't open that image. Try a JPEG or PNG.");
    }
  }

  async function read() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: text || undefined,
          image: image ? { mimeType: image.mimeType, base64: image.base64 } : undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Something went wrong.");
      onDraft(json.draft, json.mock ? "mock" : "ai", text || undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  const ready = text.trim().length > 0 || image !== null;

  return (
    <div>
      <label htmlFor="order" className="block text-sm font-medium text-gray-900">
        Customer message
      </label>
      <textarea
        id="order"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={6}
        placeholder="Paste a chat, email or text message with what the customer ordered…"
        className="mt-2 w-full resize-y rounded-xl border border-gray-300 p-3 text-sm leading-6 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
      />

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => pick(e.target.files?.[0])}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          {image ? "Change photo" : "Add a photo of a quote"}
        </button>
        {image && (
          <span className="flex items-center gap-2 text-sm text-gray-600">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={image.preview} alt="" className="h-10 w-10 rounded-md border border-gray-200 object-cover" />
            <span className="max-w-40 truncate">{image.name}</span>
            <button type="button" onClick={() => setImage(null)} className="text-gray-500 underline">
              Remove
            </button>
          </span>
        )}
      </div>

      {error && (
        <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={!ready || busy}
          onClick={read}
          className="rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-gray-300"
        >
          {busy ? "Reading…" : "Draft invoice with AI"}
        </button>
        <button
          type="button"
          onClick={() => onDraft(EMPTY, "manual")}
          className="text-sm text-gray-600 underline hover:text-gray-900"
        >
          or fill it in by hand
        </button>
      </div>

      <div className="mt-6 border-t border-gray-100 pt-4">
        <p className="text-sm font-medium text-gray-900">Try an example</p>
        <p className="mt-0.5 text-xs text-gray-500">
          Examples load a saved AI result, so they work instantly and use no AI quota.
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          {examples.map((ex) => (
            <button
              key={ex.id}
              type="button"
              onClick={() => {
                onDraft(ex.draft, "example", ex.text);
              }}
              className="rounded-xl border border-gray-200 p-3 text-left hover:border-blue-300 hover:bg-blue-50"
            >
              <span className="block text-sm font-medium text-gray-900">{ex.label}</span>
              <span className="mt-1 line-clamp-2 text-xs text-gray-500">{ex.text}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
