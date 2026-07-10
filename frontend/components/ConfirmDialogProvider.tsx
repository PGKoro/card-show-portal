"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

type ConfirmTone = "default" | "danger";

type ConfirmOptions = {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** "danger" renders the confirm button in red — use for reject/delete/etc. */
  tone?: ConfirmTone;
};

type PendingConfirm = ConfirmOptions & {
  resolve: (value: boolean) => void;
};

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

/**
 * Site-wide confirmation dialog for one-click actions that don't already
 * have their own "Save changes" review step (vendor approve/reject, role
 * changes, future delete/hide actions). Mounted once in the root layout;
 * call site usage is `const ok = await confirm({ title, tone }); if (!ok) return;`.
 */
export function ConfirmDialogProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<PendingConfirm | null>(null);

  const confirm = useCallback<ConfirmFn>((options) => {
    return new Promise<boolean>((resolve) => {
      setPending({ ...options, resolve });
    });
  }, []);

  function respond(result: boolean) {
    pending?.resolve(result);
    setPending(null);
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {pending && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
          onClick={() => respond(false)}
        >
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-dialog-title"
            className="w-full max-w-sm rounded-lg bg-white p-5 shadow-xl dark:bg-gray-900"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="confirm-dialog-title" className="text-lg font-semibold">
              {pending.title}
            </h2>
            {pending.message && (
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">{pending.message}</p>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => respond(false)}
                className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
              >
                {pending.cancelLabel ?? "Cancel"}
              </button>
              <button
                onClick={() => respond(true)}
                className={`rounded-md px-4 py-2 text-sm font-medium text-white ${
                  pending.tone === "danger"
                    ? "bg-red-600 hover:bg-red-700"
                    : "bg-brand-blue hover:bg-brand-navy"
                }`}
              >
                {pending.confirmLabel ?? "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const context = useContext(ConfirmContext);
  if (!context) {
    throw new Error("useConfirm must be used within a ConfirmDialogProvider");
  }
  return context;
}
