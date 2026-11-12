import { type InvoiceDraft } from "./schema";

export type Example = { id: string; label: string; text: string; draft: InvoiceDraft };

/** Sample orders with pre-extracted drafts, so the demo works without spending AI quota. */
export const EXAMPLES: Example[] = [
  {
    id: "design",
    label: "Freelance design",
    text: `Hi! Loved the mockups. Let's go ahead with the logo package ($450) and 3 social media banners at $60 each. Please send the invoice to dana.lee@brightcafe.example — Dana Lee, Bright Cafe. Need it by Friday if possible!`,
    draft: {
      customer: { name: "Dana Lee", email: "dana.lee@brightcafe.example" },
      items: [
        { name: "Logo package", quantity: 1, unitPrice: 450 },
        { name: "Social media banner", quantity: 3, unitPrice: 60 },
      ],
      note: "Bright Cafe — requested by Friday.",
      currency: "USD",
    },
  },
  {
    id: "bakery",
    label: "Bakery order (Korean)",
    text: `안녕하세요 사장님! 다음 주 토요일 행사용으로 마카롱 24개(개당 2.5달러), 레터링 케이크 1개(45달러) 주문할게요. 배달비 10달러도 같이 청구해 주세요. 청구서는 minji.park@eventlab.example 로 보내주세요. 박민지 드림`,
    draft: {
      customer: { name: "Minji Park", email: "minji.park@eventlab.example" },
      items: [
        { name: "Macaron", quantity: 24, unitPrice: 2.5 },
        { name: "Lettering cake", quantity: 1, unitPrice: 45 },
        { name: "Delivery fee", quantity: 1, unitPrice: 10 },
      ],
      note: "For the event next Saturday.",
      currency: "USD",
    },
  },
  {
    id: "repair",
    label: "Repair job",
    text: `Tom here from 14 Oak St. Thanks for fixing the sink today. As agreed: 2 hours labor @ $85/hr, new faucet $129.99, and the $25 call-out fee. Email me the bill at tom.w@oakmail.example and I'll pay tonight.`,
    draft: {
      customer: { name: "Tom W", email: "tom.w@oakmail.example" },
      items: [
        { name: "Labor (hours)", quantity: 2, unitPrice: 85 },
        { name: "New faucet", quantity: 1, unitPrice: 129.99 },
        { name: "Call-out fee", quantity: 1, unitPrice: 25 },
      ],
      note: "Sink repair at 14 Oak St.",
      currency: "USD",
    },
  },
];
