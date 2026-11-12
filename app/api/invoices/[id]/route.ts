import { PayPalError, getStatus } from "@/lib/paypal";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    return Response.json(await getStatus(id));
  } catch (e) {
    if (e instanceof PayPalError)
      return Response.json({ error: e.message }, { status: e.status === 400 ? 400 : 502 });
    return Response.json({ error: "Couldn't reach PayPal." }, { status: 502 });
  }
}
