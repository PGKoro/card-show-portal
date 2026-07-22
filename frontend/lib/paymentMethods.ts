// Matches backend User.PaymentMethod (apps.users.models) — a small fixed
// set of payment methods a vendor can flag as accepted at their booth.

export const PAYMENT_METHOD_OPTIONS = [
  { value: "cash", label: "Cash" },
  { value: "credit_card", label: "Credit/Debit Card" },
  { value: "venmo", label: "Venmo" },
  { value: "paypal", label: "PayPal" },
  { value: "cashapp", label: "Cash App" },
  { value: "zelle", label: "Zelle" },
] as const;

const LABEL_BY_VALUE = new Map(PAYMENT_METHOD_OPTIONS.map((o) => [o.value, o.label]));

export function labelForPaymentMethod(value: string): string {
  return LABEL_BY_VALUE.get(value as (typeof PAYMENT_METHOD_OPTIONS)[number]["value"]) ?? value;
}
