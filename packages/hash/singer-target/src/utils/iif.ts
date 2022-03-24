export function iif<R>(fn: () => R): R {
  return fn();
}
