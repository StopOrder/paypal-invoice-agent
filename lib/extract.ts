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

export function isMock(): boolean {
  return process.env.MOCK_AI === "1" || !process.env.GEMINI_API_KEY;
}

export async function extractDraft(input: ExtractInput): Promise<{ draft: InvoiceDraft; mock: boolean }> {
  const body = buildGeminiRequest(input);
  if (isMock()) return { draft: EXAMPLES[0].draft, mock: true };

  const model = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY! },
      body: JSON.stringify(body),
    },
  );
  if (res.status === 429) throw new ExtractError("The AI is out of free quota right now. Try an example instead.");
  if (!res.ok) throw new ExtractError(`AI request failed (${res.status}).`);
  return { draft: parseGeminiResponse(await res.json()), mock: false };
}
