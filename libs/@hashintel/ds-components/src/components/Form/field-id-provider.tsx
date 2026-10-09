import { FieldIdContext } from "./field-id-context";

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
