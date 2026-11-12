import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildGeminiRequest, extractDraft, parseGeminiResponse } from "./extract";

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

  it("calls Gemini with the key in a header and maps a 429 to a friendly error", async () => {
    vi.stubEnv("MOCK_AI", "0");
    vi.stubEnv("GEMINI_API_KEY", "k");
    vi.mocked(fetch).mockResolvedValue(new Response("{}", { status: 429 }));
    await expect(extractDraft({ text: "2 cakes" })).rejects.toThrow("out of free quota");
    const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).not.toContain("key=");
    expect((init.headers as Record<string, string>)["x-goog-api-key"]).toBe("k");
  });
});
