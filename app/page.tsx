import { Workspace } from "@/components/Workspace";

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10 sm:py-14">
      <header className="mb-8">
        <p className="text-sm font-semibold tracking-wide text-blue-700">PasteBill</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-gray-900">
          Paste an order. Send a PayPal invoice.
        </h1>
        <p className="mt-2 text-gray-600">
          Drop in a customer&apos;s message or a photo of a quote. AI drafts the invoice, you check it, and PayPal
          delivers it with a pay link.
        </p>
      </header>
      <Workspace />
      <footer className="mt-10 text-xs text-gray-500">
        Runs on the PayPal sandbox — no real money moves. Built for the PayPal AI Hackathon.
      </footer>
    </main>
  );
}
