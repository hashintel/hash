/** Local development trace only. Pass explicit metadata, never payloads or text. */
export const logLiveDiagnostic = (
  event: string,
  metadata: Readonly<
    Record<string, string | number | boolean | null | undefined>
  >,
): void => {
  if (!import.meta.env.DEV) return;
  // Serialize now so DevTools cannot show later mutations as earlier state.
  // oxlint-disable-next-line no-console -- owner-requested, metadata-only local diagnosis.
  console.debug(
    `[Petrinaut Live trace] ${JSON.stringify({ at: new Date().toISOString(), event, ...metadata })}`,
  );
};
