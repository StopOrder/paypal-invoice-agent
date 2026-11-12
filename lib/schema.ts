import { z } from "zod";

export const ItemSchema = z.object({
  name: z.string().trim().min(1),
  quantity: z.coerce.number().positive(),
  unitPrice: z.coerce.number().nonnegative(),
});

export const DraftSchema = z.object({
  customer: z.object({
    name: z.string().trim().default(""),
    email: z.string().trim().default(""),
  }),
  items: z.array(ItemSchema).min(1),
  note: z.string().default(""),
  currency: z.literal("USD").default("USD"),
});

export type InvoiceItem = z.infer<typeof ItemSchema>;
export type InvoiceDraft = z.infer<typeof DraftSchema>;

/** Validate anything (AI output, request body) into a draft. Throws on bad shape. */
export function parseDraft(input: unknown): InvoiceDraft {
  return DraftSchema.parse(input);
}

/** Total in dollars, computed in cents to avoid float drift. */
export function total(draft: Pick<InvoiceDraft, "items">): number {
  const cents = draft.items.reduce(
    (sum, it) => sum + Math.round(it.quantity * it.unitPrice * 100),
    0,
  );
  return cents / 100;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** An invoice can only be sent when we know who to send it to. */
export function canSend(draft: InvoiceDraft): boolean {
  return EMAIL.test(draft.customer.email) && draft.items.length > 0 && total(draft) > 0;
}
