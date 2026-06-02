import { createContext, use } from "react";

const FieldIdContext = createContext<string | null>(null);

/**
 * Provides a stable field id to descendants.
 * Pair with `useFieldId` to read the id in deeply-nested inputs.
 */
export const FieldIdProvider = ({
  id,
  children,
}: {
  id: string;
  children: React.ReactNode;
}) => {
  return <FieldIdContext value={id}>{children}</FieldIdContext>;
};

/**
 * Returns the field id provided by the nearest `FieldIdProvider`, or `null`
 * if no provider is present (eg. when the input is rendered outside a
 * FormField).
 */
export const useFieldId = (): string | null => use(FieldIdContext);
