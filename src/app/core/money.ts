/** Money formatting for the UI. Amounts are EUR, pt-PT locale (design decision, guito-api#40). */
export function formatEur(value: number, options: { signed?: boolean } = {}): string {
  const formatter = new Intl.NumberFormat('pt-PT', {
    style: 'currency',
    currency: 'EUR',
    signDisplay: options.signed ? 'always' : 'auto',
  });
  return formatter.format(value);
}
