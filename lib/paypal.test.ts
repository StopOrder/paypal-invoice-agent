import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { _resetTokenCache, createAndSend, getStatus, toPayPalInvoice } from "./paypal";
import { parseDraft } from "./schema";

const draft = parseDraft({
  customer: { name: "Dana Marie Lee", email: "dana@example.com" },
  items: [
    { name: "Logo design", quantity: 1, unitPrice: 450 },
    { name: "Revision", quantity: 3, unitPrice: 19.9 },
  ],
  note: "Thanks!",
});

describe("toPayPalInvoice", () => {
  it("maps customer, items and money into PayPal's shape", () => {
    const body = toPayPalInvoice(draft, "INV-7");
    expect(body.detail).toMatchObject({ invoice_number: "INV-7", currency_code: "USD", note: "Thanks!" });
    expect(body.primary_recipients[0].billing_info).toEqual({
      name: { given_name: "Dana", surname: "Marie Lee" },
      email_address: "dana@example.com",
    });
    expect(body.items[1]).toEqual({
      name: "Revision",
      quantity: "3",
      unit_amount: { currency_code: "USD", value: "19.90" },
      unit_of_measure: "QUANTITY",
    });
  });
  it("omits name and note when they are empty", () => {
    const body = toPayPalInvoice(parseDraft({ customer: { email: "a@b.co" }, items: draft.items }), "1");
    expect(body.primary_recipients[0].billing_info).toEqual({ email_address: "a@b.co" });
    expect("note" in body.detail).toBe(false);
  });
});

describe("PayPal calls", () => {
  const calls: { url: string; method: string; body?: unknown }[] = [];
  const reply = (json: unknown, status = 200) =>
    new Response(JSON.stringify(json), { status, headers: { "Content-Type": "application/json" } });

  beforeEach(() => {
    calls.length = 0;
    _resetTokenCache();
    process.env.PAYPAL_CLIENT_ID = "id";
    process.env.PAYPAL_CLIENT_SECRET = "secret";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        const path = new URL(url).pathname;
        calls.push({ url: path, method: init.method ?? "GET", body: init.body ? String(init.body) : undefined });
        if (path === "/v1/oauth2/token") return reply({ access_token: "T", expires_in: 3600 });
        if (path.endsWith("/generate-next-invoice-number")) return reply({ invoice_number: "0042" });
        if (path === "/v2/invoicing/invoices") return reply({ id: "INV2-AAAA", status: "DRAFT" }, 201);
        if (path.endsWith("/send")) return reply({ rel: "self", href: "x" });
        if (path === "/v2/invoicing/invoices/INV2-AAAA")
          return reply({
            id: "INV2-AAAA",
            status: "SENT",
            detail: { invoice_number: "0042", metadata: { recipient_view_url: "https://pay/x" } },
            amount: { value: "509.70" },
            primary_recipients: [{ billing_info: { email_address: "dana@example.com" } }],
          });
        if (path === "/v2/invoicing/invoices/BAD") return reply({ message: "Not found" }, 404);
        return reply({}, 500);
      }),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it("numbers, creates, sends, then reads back the invoice", async () => {
    const out = await createAndSend(draft);
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      "POST /v1/oauth2/token",
      "POST /v2/invoicing/generate-next-invoice-number",
      "POST /v2/invoicing/invoices",
      "POST /v2/invoicing/invoices/INV2-AAAA/send",
      "GET /v2/invoicing/invoices/INV2-AAAA",
    ]);
    expect(JSON.parse(calls[2].body as string).detail.invoice_number).toBe("0042");
    expect(out).toEqual({
      id: "INV2-AAAA",
      status: "SENT",
      invoiceNumber: "0042",
      payUrl: "https://pay/x",
      amount: "509.70",
      email: "dana@example.com",
    });
  });

  it("surfaces PayPal's error message", async () => {
    await expect(getStatus("BAD")).rejects.toThrow("PayPal: Not found");
  });

  it("rejects ids that could alter the request path", async () => {
    await expect(getStatus("../oauth")).rejects.toThrow("Invalid invoice id");
  });
});
