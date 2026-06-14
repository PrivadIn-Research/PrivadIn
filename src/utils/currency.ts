export function formatCurrencyFromCents(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value / 100);
}

export function digitsOnly(value: string) {
  return value.replace(/\D/g, "");
}

export function formatCurrencyInput(value: string) {
  const digits = digitsOnly(value);
  const cents = digits ? Number(digits) : 0;
  return formatCurrencyFromCents(cents);
}

export function parseCurrencyInputToCents(value: string) {
  const digits = digitsOnly(value);
  return digits ? Number(digits) : 0;
}
