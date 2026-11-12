import { clientIp } from "@/lib/client-ip";
import { ExtractError, extractDraft, isMock } from "@/lib/extract";
import { allow } from "@/lib/ratelimit";

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_IMAGE_BASE64 = 4_000_000;

export async function POST(req: Request) {
  let body: { text?: unknown; image?: { mimeType?: unknown; base64?: unknown } };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  const text = typeof body.text === "string" ? body.text : undefined;
  let image: { mimeType: string; base64: string } | undefined;
  if (body.image) {
    const { mimeType, base64 } = body.image;
    if (typeof mimeType !== "string" || typeof base64 !== "string" || !IMAGE_TYPES.includes(mimeType))
      return Response.json({ error: "Use a JPEG, PNG or WebP image." }, { status: 400 });
    if (base64.length > MAX_IMAGE_BASE64)
      return Response.json({ error: "That image is too large." }, { status: 413 });
    image = { mimeType, base64 };
  }

  if (!isMock()) {
    const gate = allow(`extract:${clientIp(req)}`, {
      perClient: Number(process.env.EXTRACT_DAILY_LIMIT ?? 5),
      global: Number(process.env.EXTRACT_GLOBAL_DAILY_LIMIT ?? 150),
    });
    if (!gate.ok)
      return Response.json(
        {
          error:
            gate.reason === "client"
              ? "You've used today's free AI reads. The examples still work without AI."
              : "Today's free AI budget is used up. The examples still work without AI.",
        },
        { status: 429 },
      );
  }

  try {
    return Response.json(await extractDraft({ text, image }));
  } catch (e) {
    if (e instanceof ExtractError) return Response.json({ error: e.message }, { status: 422 });
    return Response.json({ error: "Something went wrong reading that." }, { status: 500 });
  }
}
