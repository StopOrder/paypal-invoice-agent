import { describe, expect, it } from "vitest";
import { canSend, parseDraft, total } from "./schema";

const good = {
  customer: { name: "Dana Lee", email: "dana@example.com" },
  items: [
    { name: "Logo design", quantity: 1, unitPrice: 450 },
    { name: "Revision", quantity: 3, unitPrice: 19.99 },
  ],
  note: "Thanks!",
};

describe("parseDraft", () => {
  it("accepts a well-formed draft and defaults currency to USD", () => {
    const d = parseDraft(good);
    expect(d.currency).toBe("USD");
    expect(d.items).toHaveLength(2);
  });
  it("coerces numeric strings from AI output", () => {
    const d = parseDraft({ ...good, items: [{ name: "A", quantity: "2", unitPrice: "10.5" }] });
    expect(d.items[0]).toEqual({ name: "A", quantity: 2, unitPrice: 10.5 });
  });
  it("fills missing customer fields with empty strings", () => {
    const d = parseDraft({ customer: {}, items: good.items });
    expect(d.customer).toEqual({ name: "", email: "" });
    expect(d.note).toBe("");
  });
  it("rejects a draft with no items", () => {
    expect(() => parseDraft({ ...good, items: [] })).toThrow();
  });
  it("rejects zero or negative quantity", () => {
    expect(() => parseDraft({ ...good, items: [{ name: "A", quantity: 0, unitPrice: 1 }] })).toThrow();
  });
});

describe("total", () => {
  it("sums in cents without float drift", () => {
    expect(total(parseDraft(good))).toBe(509.97);
    expect(total({ items: [{ name: "x", quantity: 3, unitPrice: 0.1 }] })).toBe(0.3);
  });
});

describe("canSend", () => {
  it("is true with a valid email and a positive total", () => {
    expect(canSend(parseDraft(good))).toBe(true);
  });
  it("is false without a valid email", () => {
    expect(canSend(parseDraft({ ...good, customer: { name: "Dana", email: "dana" } }))).toBe(false);
  });
  it("is false when the total is zero", () => {
    expect(canSend(parseDraft({ ...good, items: [{ name: "Free", quantity: 1, unitPrice: 0 }] }))).toBe(false);
  });
});
