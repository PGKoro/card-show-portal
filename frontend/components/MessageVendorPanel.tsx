"use client";

import { useState } from "react";

// Placeholder for real in-app messaging (Conversation/Message models +
// a vendor inbox) — not built yet. This lets customers see and try the
// composer experience now; "Send" just reveals a "coming soon" notice
// instead of actually delivering anything, so nobody mistakenly believes
// a vendor received a message that was never sent.
export function MessageVendorPanel({
  vendorName,
  itemTitle,
}: {
  vendorName: string;
  itemTitle?: string;
}) {
  const [message, setMessage] = useState(
    itemTitle
      ? `Hi ${vendorName}, I'm interested in "${itemTitle}" — is it still available?`
      : `Hi ${vendorName}, I had a question about your inventory.`,
  );
  const [sent, setSent] = useState(false);

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-transparent">
      <div className="mb-2 flex items-center gap-2">
        <h3 className="font-semibold">Message {vendorName}</h3>
        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500 dark:bg-gray-800 dark:text-gray-400">
          Coming soon
        </span>
      </div>

      {sent ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
          Direct messaging isn&apos;t live yet — this was just a preview. Check back soon for the
          ability to reach vendors directly through the site.
        </p>
      ) : (
        <>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={3}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-transparent"
          />
          <button
            type="button"
            onClick={() => setSent(true)}
            disabled={!message.trim()}
            className="mt-2 rounded-md bg-brand-blue px-4 py-2 text-sm font-medium text-white hover:bg-brand-navy disabled:opacity-50"
          >
            Send Message
          </button>
        </>
      )}
    </div>
  );
}
