type Bucket = { day: string; count: number };

const perClient = new Map<string, Bucket>();
let global: Bucket = { day: "", count: 0 };

const today = (now: Date) => now.toISOString().slice(0, 10);

/**
 * Daily cap per client plus a global cap, to protect the free AI quota.
 * In-memory: on serverless each instance counts separately, so treat the caps as approximate.
 */
export function allow(
  client: string,
  opts: { perClient: number; global: number; now?: Date },
): { ok: boolean; reason?: "client" | "global" } {
  const day = today(opts.now ?? new Date());
  if (global.day !== day) {
    global = { day, count: 0 };
    perClient.clear();
  }
  const bucket = perClient.get(client) ?? { day, count: 0 };
  if (global.count >= opts.global) return { ok: false, reason: "global" };
  if (bucket.count >= opts.perClient) return { ok: false, reason: "client" };
  bucket.count += 1;
  global.count += 1;
  perClient.set(client, bucket);
  return { ok: true };
}

export function _reset() {
  perClient.clear();
  global = { day: "", count: 0 };
}
