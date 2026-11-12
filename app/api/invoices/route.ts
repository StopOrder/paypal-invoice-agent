import { clientIp } from "@/lib/client-ip";
import { PayPalError, createAndSend } from "@/lib/paypal";
import { allow } from "@/lib/ratelimit";
import { canSend, parseDraft, type InvoiceDraft } from "@/lib/schema";

export async function POST(req: Request) {
  let draft: InvoiceDraft;
  try {
    draft = parseDraft((await req.json())?.draft);
  } catch {
    return Response.json({ error: "The invoice needs at least one item with a quantity and price." }, { status: 400 });
  }
  if (!canSend(draft))
    return Response.json({ error: "Add a valid customer email and a total above zero." }, { status: 400 });

  const gate = allow(`send:${clientIp(req)}`, {
    perClient: Number(process.env.SEND_DAILY_LIMIT ?? 20),
    global: Number(process.env.SEND_GLOBAL_DAILY_LIMIT ?? 500),
  });
  if (!gate.ok) return Response.json({ error: "Daily demo limit reached. Try again tomorrow." }, { status: 429 });

  try {
    return Response.json(await createAndSend(draft));
  } catch (e) {
    if (e instanceof PayPalError) return Response.json({ error: e.message }, { status: 502 });
    return Response.json({ error: "Couldn't reach PayPal." }, { status: 502 });
  }
}
