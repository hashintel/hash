import { createContext, use } from "react";

export const FieldIdContext = createContext<string | null>(null);

/**
 * Returns the field id provided by the nearest `FieldIdProvider`, or `null`
 * if no provider is present (eg. when the input is rendered outside a
 * FormField).
 */
export const useFieldId = (): string | null => use(FieldIdContext);
