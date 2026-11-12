import { EXAMPLES } from "./examples";
import { parseDraft, type InvoiceDraft } from "./schema";

export type ExtractInput = {
  text?: string;
  image?: { mimeType: string; base64: string };
};

export class ExtractError extends Error {}

const SYSTEM = `You turn a customer's order message, chat, or a photo of a quote into an invoice draft.
Rules:
- Extract only what is stated. Never invent an email address; use "" when it is missing.
- customer.name: the person or business to bill. Romanize non-Latin names (e.g. 박민지 -> Minji Park).
- items: one row per billable line. Write item names in concise English.
- quantity: a positive number. unitPrice: the price for ONE unit, in US dollars, as a plain number.
- If only a line total is given, divide by quantity to get the unit price.
- If prices are in another currency, keep the numbers as written and say so in note.
- note: one short English sentence with useful context (deadline, address, occasion). "" if none.`;

const JSON_SHAPE = `Reply with one JSON object and nothing else, in exactly this shape:
{"customer":{"name":string,"email":string},"items":[{"name":string,"quantity":number,"unitPrice":number}],"note":string}`;

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    customer: {
      type: "OBJECT",
      properties: { name: { type: "STRING" }, email: { type: "STRING" } },
      required: ["name", "email"],
    },
    items: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          name: { type: "STRING" },
          quantity: { type: "NUMBER" },
          unitPrice: { type: "NUMBER" },
        },
        required: ["name", "quantity", "unitPrice"],
      },
    },
    note: { type: "STRING" },
  },
  required: ["customer", "items", "note"],
};

/** Build the Gemini generateContent request body. Exported for tests. */
export function buildGeminiRequest(input: ExtractInput) {
  const parts: unknown[] = [];
  if (input.text?.trim()) parts.push({ text: input.text.trim().slice(0, 8000) });
  if (input.image) parts.push({ inlineData: { mimeType: input.image.mimeType, data: input.image.base64 } });
  if (parts.length === 0) throw new ExtractError("Paste a message or add a photo first.");
  return {
    systemInstruction: { parts: [{ text: SYSTEM }] },
    contents: [{ role: "user", parts }],
    generationConfig: {
      temperature: 0,
      responseMimeType: "application/json",
      responseSchema: RESPONSE_SCHEMA,
    },
  };
}

/** Parse Gemini's response envelope into a validated draft. Exported for tests. */
export function parseGeminiResponse(json: unknown): InvoiceDraft {
  const text = (json as { candidates?: { content?: { parts?: { text?: string }[] } }[] })?.candidates?.[0]
    ?.content?.parts?.map((p) => p.text ?? "")
    .join("");
  if (!text) throw new ExtractError("The AI returned an empty answer.");
  try {
    return parseDraft(JSON.parse(text));
  } catch {
    throw new ExtractError("Couldn't find any billable items in that. Try adding prices and quantities.");
  }
}

/** Build an OpenAI-compatible chat-completions body (bizrouter, DeepSeek, OpenAI…). Exported for tests. */
export function buildChatRequest(input: ExtractInput, model: string) {
  const content: unknown[] = [];
  if (input.text?.trim()) content.push({ type: "text", text: input.text.trim().slice(0, 8000) });
  if (input.image)
    content.push({
      type: "image_url",
      image_url: { url: `data:${input.image.mimeType};base64,${input.image.base64}` },
    });
  if (content.length === 0) throw new ExtractError("Paste a message or add a photo first.");
  return {
    model,
    temperature: 0,
    max_tokens: 4000,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: `${SYSTEM}\n\n${JSON_SHAPE}` },
      { role: "user", content },
    ],
  };
}

/** Parse an OpenAI-compatible response into a validated draft. Exported for tests. */
export function parseChatResponse(json: unknown): InvoiceDraft {
  const raw = (json as { choices?: { message?: { content?: string } }[] })?.choices?.[0]?.message?.content;
  if (!raw) throw new ExtractError("The AI returned an empty answer.");
  const text = raw.replace(/^\s*```(?:json)?/i, "").replace(/```\s*$/, "").trim();
  try {
    return parseDraft(JSON.parse(text));
  } catch {
    throw new ExtractError("Couldn't find any billable items in that. Try adding prices and quantities.");
  }
}

type Provider =
  | { kind: "chat"; baseUrl: string; apiKey: string; model: string }
  | { kind: "gemini"; apiKey: string; model: string };

/** An OpenAI-compatible endpoint wins when configured; otherwise Gemini; otherwise mock. */
export function provider(): Provider | null {
  if (process.env.MOCK_AI === "1") return null;
  const { AI_BASE_URL, AI_API_KEY, AI_MODEL, GEMINI_API_KEY, GEMINI_MODEL } = process.env;
  if (AI_BASE_URL && AI_API_KEY && AI_MODEL)
    return { kind: "chat", baseUrl: AI_BASE_URL.replace(/\/$/, ""), apiKey: AI_API_KEY, model: AI_MODEL };
  if (GEMINI_API_KEY) return { kind: "gemini", apiKey: GEMINI_API_KEY, model: GEMINI_MODEL ?? "gemini-3.8-flash" };
  return null;
}

export function isMock(): boolean {
  return provider() === null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** POST JSON, retrying once when the provider is briefly overloaded. */
async function post(url: string, headers: Record<string, string>, body: unknown): Promise<unknown> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(45_000),
    });
    if (res.ok) return res.json();
    if (res.status === 429) throw new ExtractError("The AI is out of quota right now. Try an example instead.");
    if (res.status === 503 && attempt === 0) {
      await sleep(1500);
      continue;
    }
    throw new ExtractError(`AI request failed (${res.status}).`);
  }
}

export async function extractDraft(input: ExtractInput): Promise<{ draft: InvoiceDraft; mock: boolean }> {
  const p = provider();
  if (!p) {
    buildGeminiRequest(input); // still validates that there is something to read
    return { draft: EXAMPLES[0].draft, mock: true };
  }
  if (p.kind === "chat") {
    const json = await post(`${p.baseUrl}/chat/completions`, { Authorization: `Bearer ${p.apiKey}` }, buildChatRequest(input, p.model));
    return { draft: parseChatResponse(json), mock: false };
  }
  const json = await post(
    `https://generativelanguage.googleapis.com/v1beta/models/${p.model}:generateContent`,
    { "x-goog-api-key": p.apiKey },
    buildGeminiRequest(input),
  );
  return { draft: parseGeminiResponse(json), mock: false };
}
