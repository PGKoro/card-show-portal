"use client";

import { useState, type FormEvent } from "react";

// Pure UI — no message is actually sent anywhere. Clicking through shows the
// compose form, then a fake "sent" confirmation.
export function MessageVendorPanel({ vendorName }: { vendorName: string }) {
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState(false);
  const [message, setMessage] = useState(
    `Hi, is this still available? I'd love to know more before the next show.`,
  );

  if (sent) {
    return (
      <div className="rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300">
        Message sent to {vendorName}! They typically reply within a day.
      </div>
    );
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full rounded-md bg-brand-blue px-5 py-2.5 font-medium text-white hover:bg-brand-navy sm:w-auto"
      >
        Message Vendor
      </button>
    );
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSent(true);
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="w-full max-w-md space-y-3 rounded-md border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800"
    >
      <label htmlFor="message" className="block text-sm font-medium">
        Message to {vendorName}
      </label>
      <textarea
        id="message"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        rows={4}
        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-transparent"
      />
      <div className="flex gap-2">
        <button
          type="submit"
          className="rounded-md bg-brand-blue px-4 py-2 text-sm font-medium text-white hover:bg-brand-navy"
        >
          Send
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-900"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
