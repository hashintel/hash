/**
 * A shared no-op: a stable, inert function for default and placeholder
 * handlers. Published as its own entry (`@hashintel/ds-components/noop`)
 * because the docs examples author handlers as `onChange={noop}` — a client
 * module's exports cross the React Server Components boundary as references,
 * where an inline `() => {}` cannot.
 */
export const noop = (): void => {};
