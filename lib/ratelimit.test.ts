import { beforeEach, describe, expect, it } from "vitest";
import { _reset, allow } from "./ratelimit";

const d1 = new Date("2026-11-12T10:00:00Z");
const d2 = new Date("2026-11-13T00:00:01Z");

describe("allow", () => {
  beforeEach(() => _reset());

  it("caps each client per day", () => {
    const o = { perClient: 2, global: 100, now: d1 };
    expect(allow("a", o).ok).toBe(true);
    expect(allow("a", o).ok).toBe(true);
    expect(allow("a", o)).toEqual({ ok: false, reason: "client" });
    expect(allow("b", o).ok).toBe(true);
  });

  it("caps everyone together", () => {
    const o = { perClient: 5, global: 2, now: d1 };
    allow("a", o);
    allow("b", o);
    expect(allow("c", o)).toEqual({ ok: false, reason: "global" });
  });

  it("resets on a new day", () => {
    allow("a", { perClient: 1, global: 1, now: d1 });
    expect(allow("a", { perClient: 1, global: 1, now: d2 }).ok).toBe(true);
  });
});
