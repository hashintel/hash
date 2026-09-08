const maxErrorTextLength = 10_000;

const nonEmptyText = (value: string): string | null =>
  value.trim().length > 0 ? value : null;

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value) as unknown;
  return prototype === Object.prototype || prototype === null;
};

const serializePlainObject = (
  value: Record<string, unknown>,
  seen: WeakSet<object>,
): string | null => {
  try {
    const serialized: unknown = JSON.stringify(
      value,
      (_key, nestedValue: unknown) => {
        if (typeof nestedValue === "bigint") {
          return nestedValue.toString();
        }
        if (typeof nestedValue !== "object" || nestedValue === null) {
          return nestedValue;
        }
        if (seen.has(nestedValue)) {
          return "[Circular]";
        }
        seen.add(nestedValue);
        return nestedValue;
      },
    );
    return typeof serialized === "string" ? serialized : null;
  } catch {
    return null;
  }
};

const serializeErrorValue = (
  value: unknown,
  seen: WeakSet<object>,
): string | null => {
  if (typeof value === "string") {
    return nonEmptyText(value);
  }
  if (value instanceof Error) {
    if (seen.has(value)) {
      return "[Circular]";
    }
    seen.add(value);

    const message = nonEmptyText(value.message);
    const cause =
      value.cause === undefined ? null : serializeErrorValue(value.cause, seen);
    if (message !== null && cause !== null) {
      return `${message}\nCaused by: ${cause}`;
    }
    return message ?? cause;
  }
  if (isPlainObject(value)) {
    return serializePlainObject(value, seen);
  }
  return null;
};

export const serializeErrorText = (
  error: unknown,
  fallback = "The chat turn failed.",
): string => {
  const serialized = serializeErrorValue(error, new WeakSet());
  if (serialized === null) {
    return fallback;
  }
  if (serialized.length <= maxErrorTextLength) {
    return serialized;
  }
  return `${serialized.slice(0, maxErrorTextLength - 1)}…`;
};
