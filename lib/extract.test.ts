import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildChatRequest, buildGeminiRequest, extractDraft, parseChatResponse, parseGeminiResponse } from "./extract";

const envelope = (obj: unknown) => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] } }] });

describe("buildGeminiRequest", () => {
  it("sends text and image as separate parts and asks for JSON", () => {
    const req = buildGeminiRequest({ text: " 2 cakes $10 ", image: { mimeType: "image/png", base64: "AAA" } });
    expect(req.contents[0].parts).toEqual([
      { text: "2 cakes $10" },
      { inlineData: { mimeType: "image/png", data: "AAA" } },
    ]);
    expect(req.generationConfig.responseMimeType).toBe("application/json");
  });
  it("refuses empty input", () => {
    expect(() => buildGeminiRequest({ text: "   " })).toThrow("Paste a message");
  });
});

describe("parseGeminiResponse", () => {
  it("returns a validated draft", () => {
    const d = parseGeminiResponse(
      envelope({ customer: { name: "A", email: "" }, items: [{ name: "Cake", quantity: 2, unitPrice: 10 }], note: "" }),
    );
    expect(d.items[0].unitPrice).toBe(10);
    expect(d.currency).toBe("USD");
  });
  it("explains when nothing billable was found", () => {
    expect(() => parseGeminiResponse(envelope({ customer: { name: "", email: "" }, items: [], note: "" }))).toThrow(
      "billable items",
    );
  });
  it("explains an empty answer", () => {
    expect(() => parseGeminiResponse({ candidates: [] })).toThrow("empty answer");
  });
});

describe("OpenAI-compatible provider", () => {
  it("sends the image as a data URL and asks for a JSON object", () => {
    const req = buildChatRequest({ text: "2 cakes", image: { mimeType: "image/jpeg", base64: "AAA" } }, "m");
    expect(req.model).toBe("m");
    expect(req.response_format).toEqual({ type: "json_object" });
    expect(req.messages[1].content).toEqual([
      { type: "text", text: "2 cakes" },
      { type: "image_url", image_url: { url: "data:image/jpeg;base64,AAA" } },
    ]);
  });
  it("accepts JSON wrapped in a code fence", () => {
    const content = '```json\n{"customer":{"name":"A","email":""},"items":[{"name":"Cake","quantity":1,"unitPrice":9}],"note":""}\n```';
    expect(parseChatResponse({ choices: [{ message: { content } }] }).items[0].name).toBe("Cake");
  });
  it("explains an empty answer", () => {
    expect(() => parseChatResponse({ choices: [] })).toThrow("empty answer");
  });
});

describe("extractDraft", () => {
  beforeEach(() => vi.stubGlobal("fetch", vi.fn()));
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("never calls the network in mock mode", async () => {
    vi.stubEnv("MOCK_AI", "1");
    vi.stubEnv("GEMINI_API_KEY", "k");
    const out = await extractDraft({ text: "anything" });
    expect(out.mock).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("prefers the OpenAI-compatible endpoint when it is configured", async () => {
    vi.stubEnv("MOCK_AI", "0");
    vi.stubEnv("GEMINI_API_KEY", "g");
    vi.stubEnv("AI_BASE_URL", "https://ai.test/v1/");
    vi.stubEnv("AI_API_KEY", "k");
    vi.stubEnv("AI_MODEL", "m");
    const content = '{"customer":{"name":"A","email":"a@b.co"},"items":[{"name":"Cake","quantity":2,"unitPrice":10}],"note":""}';
    vi.mocked(fetch).mockResolvedValue(Response.json({ choices: [{ message: { content } }] }));
    const out = await extractDraft({ text: "2 cakes" });
    expect(out.mock).toBe(false);
    expect(out.draft.items[0].quantity).toBe(2);
    const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://ai.test/v1/chat/completions");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer k");
  });

  it("retries once when the provider is overloaded", async () => {
    vi.stubEnv("MOCK_AI", "0");
    vi.stubEnv("GEMINI_API_KEY", "k");
    vi.stubEnv("AI_BASE_URL", "");
    vi.mocked(fetch).mockImplementation(async () => new Response("{}", { status: 503 }));
    await expect(extractDraft({ text: "2 cakes" })).rejects.toThrow("AI request failed (503)");
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("calls Gemini with the key in a header and maps a 429 to a friendly error", async () => {
    vi.stubEnv("MOCK_AI", "0");
    vi.stubEnv("AI_BASE_URL", "");
    vi.stubEnv("GEMINI_API_KEY", "k");
    vi.mocked(fetch).mockResolvedValue(new Response("{}", { status: 429 }));
    await expect(extractDraft({ text: "2 cakes" })).rejects.toThrow("out of quota");
    const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).not.toContain("key=");
    expect((init.headers as Record<string, string>)["x-goog-api-key"]).toBe("k");
  });
});
