# PasteBill

**Paste an order. Send a PayPal invoice.**

Small sellers take orders in chat: a text message, an email, a photo of a handwritten quote. Turning that into a proper invoice means retyping every line. PasteBill reads the message with AI, shows you an editable draft, and sends it through PayPal with a pay link.

Built for the [PayPal AI Hackathon](https://paypalaihackathon.devpost.com/).

## How it works

1. **Paste** a customer message, or add a photo of a quote.
2. **Review** the draft the AI extracted: customer, line items, quantities, unit prices, note. Everything is editable, and the total updates as you type.
3. **Send.** PasteBill creates the invoice in PayPal, sends it to the customer, and shows the pay link. The status flips to *Paid* by itself once the customer pays.

Nothing is sent without a human check: the AI only drafts, and the send button stays locked until there is a valid email and a total above zero.

## Tools used

| Tool | What it does here |
| --- | --- |
| **PayPal Invoicing API v2** (sandbox) | Generates the invoice number, creates the draft invoice, sends it to the customer, and reports payment status. OAuth 2.0 client-credentials for auth. |
| **DeepSeek V4.1 Flash** (via bizrouter, an OpenAI-compatible gateway) | Reads the pasted text or photo and returns the invoice draft as JSON. Handles non-English messages and romanizes names. Any OpenAI-compatible vision model works; **Google Gemini** is supported as an alternative provider. |
| **Next.js 16 + React 19 + Tailwind CSS 4** | UI and server routes. API keys stay on the server. |
| **Zod** | Validates the AI's output and every request before anything reaches PayPal. |
| **Vitest** | Unit tests. |

## Run it locally

Requires Node.js 20+.

```bash
git clone https://github.com/StopOrder/paypal-invoice-agent.git
cd paypal-invoice-agent
npm install
cp .env.example .env.local
npm run dev
```

Open http://localhost:3000.

### Configure `.env.local`

| Variable | Where to get it |
| --- | --- |
| `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET` | [developer.paypal.com](https://developer.paypal.com/) → Apps & Credentials → **Sandbox** |
| `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL` | Any OpenAI-compatible chat-completions endpoint with a vision model. Used when all three are set. |
| `GEMINI_API_KEY` | Alternative: [aistudio.google.com](https://aistudio.google.com/) → Get API key. Used when the `AI_*` values are empty. |
| `MOCK_AI` | `1` skips the AI and returns a sample draft. Set to `0` to use the real model. |

Without any keys the app still runs: the three built-in examples load saved AI results, so you can walk through the review screen. Sending an invoice needs the PayPal sandbox keys.

### Try the photo path

[`public/sample-quote.jpg`](public/sample-quote.jpg) is a sample quote you can upload with **Add a photo of a quote**.

### Pay a test invoice

After sending, open the pay link and log in with a **sandbox Personal (buyer) account** from developer.paypal.com → Testing Tools → Sandbox Accounts. No real money moves.

## Tests

```bash
npm test
```

Covers draft validation and totals, the draft-to-PayPal mapping, the PayPal call sequence (with `fetch` stubbed), AI request/response handling, and the rate limiter.

## Project layout

```
app/
  page.tsx                  landing page
  api/extract/route.ts      POST  text/photo -> invoice draft (AI)
  api/invoices/route.ts     POST  draft -> PayPal invoice, sent
  api/invoices/[id]/route.ts GET  invoice status
components/                 Paste -> Review -> Sent steps
lib/
  schema.ts                 InvoiceDraft type, validation, totals
  extract.ts                AI call (OpenAI-compatible or Gemini) + response parsing
  paypal.ts                 OAuth, mapping, create/send/status
  ratelimit.ts              daily caps that protect the free AI quota
  examples.ts               sample orders with saved drafts
```

## Limits

- Sandbox only, USD only.
- Rate limits are in-memory, so on serverless hosting they are approximate.
- The AI can misread a message. That is why the review step exists.

## License

[MIT](LICENSE)
