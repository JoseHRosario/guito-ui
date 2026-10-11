/** Money formatting for the UI. Amounts are EUR, pt-PT locale (design decision, guito-api#40). */
export function formatEur(value: number | string | null, options: { signed?: boolean } = {}): string {
  const formatter = new Intl.NumberFormat('pt-PT', {
    style: 'currency',
    currency: 'EUR',
    signDisplay: options.signed ? 'always' : 'auto',
  });
  return value === null ? '—' : formatter.format(Number(value));
}
