import { type InvoiceDraft } from "./schema";

const BASE = () => process.env.PAYPAL_API_BASE ?? "https://api-m.sandbox.paypal.com";

export class PayPalError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

/** Pure mapping from our draft to the PayPal Invoicing v2 create-invoice body. */
export function toPayPalInvoice(draft: InvoiceDraft, invoiceNumber: string) {
  const [given, ...rest] = draft.customer.name.trim().split(/\s+/).filter(Boolean);
  const name = given ? { given_name: given, ...(rest.length ? { surname: rest.join(" ") } : {}) } : undefined;
  return {
    detail: {
      invoice_number: invoiceNumber,
      currency_code: draft.currency,
      ...(draft.note ? { note: draft.note.slice(0, 4000) } : {}),
      payment_term: { term_type: "DUE_ON_RECEIPT" },
    },
    primary_recipients: [
      {
        billing_info: {
          ...(name ? { name } : {}),
          email_address: draft.customer.email,
        },
      },
    ],
    items: draft.items.map((it) => ({
      name: it.name.slice(0, 200),
      quantity: String(it.quantity),
      unit_amount: { currency_code: draft.currency, value: it.unitPrice.toFixed(2) },
      unit_of_measure: "QUANTITY",
    })),
  };
}

let cached: { token: string; expires: number } | null = null;

export async function getToken(): Promise<string> {
  if (cached && cached.expires > Date.now() + 60_000) return cached.token;
  const id = process.env.PAYPAL_CLIENT_ID;
  const secret = process.env.PAYPAL_CLIENT_SECRET;
  if (!id || !secret) throw new PayPalError("PayPal credentials are not configured on the server.", 500);
  const res = await fetch(`${BASE()}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) throw new PayPalError(`PayPal auth failed (${res.status})`, res.status);
  const json = (await res.json()) as { access_token: string; expires_in: number };
  cached = { token: json.access_token, expires: Date.now() + json.expires_in * 1000 };
  return cached.token;
}

async function call<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const token = await getToken();
  const res = await fetch(`${BASE()}${path}`, {
    method: init.method ?? "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (!res.ok) {
    const detail = json?.details?.[0]?.description ?? json?.message ?? `HTTP ${res.status}`;
    throw new PayPalError(`PayPal: ${detail}`, res.status);
  }
  return json as T;
}

type PayPalInvoice = {
  id: string;
  status: string;
  detail?: { invoice_number?: string; metadata?: { recipient_view_url?: string } };
  amount?: { value?: string; currency_code?: string };
};

export type InvoiceStatus = {
  id: string;
  status: string;
  invoiceNumber: string;
  payUrl: string;
  amount: string;
};

function summarize(inv: PayPalInvoice): InvoiceStatus {
  return {
    id: inv.id,
    status: inv.status,
    invoiceNumber: inv.detail?.invoice_number ?? "",
    payUrl: inv.detail?.metadata?.recipient_view_url ?? "",
    amount: inv.amount?.value ?? "",
  };
}

/** Create a draft invoice in PayPal, send it to the customer, and return its live state. */
export async function createAndSend(draft: InvoiceDraft): Promise<InvoiceStatus> {
  const { invoice_number } = await call<{ invoice_number: string }>(
    "/v2/invoicing/generate-next-invoice-number",
    { method: "POST" },
  );
  const created = await call<PayPalInvoice>("/v2/invoicing/invoices", {
    method: "POST",
    body: toPayPalInvoice(draft, invoice_number),
  });
  await call(`/v2/invoicing/invoices/${created.id}/send`, {
    method: "POST",
    body: { send_to_recipient: true, send_to_invoicer: false },
  });
  return getStatus(created.id);
}

export async function getStatus(id: string): Promise<InvoiceStatus> {
  if (!/^[A-Za-z0-9-]+$/.test(id)) throw new PayPalError("Invalid invoice id", 400);
  return summarize(await call<PayPalInvoice>(`/v2/invoicing/invoices/${id}`));
}

export function _resetTokenCache() {
  cached = null;
}
