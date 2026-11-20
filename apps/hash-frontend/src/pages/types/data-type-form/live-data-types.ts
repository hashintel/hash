import type { DataTypeWithMetadata } from "@blockprotocol/type-system";

/**
 * Whether a type's latest edition is live (not archived). The loaded
 * catalogue spans all transaction time, so archived types appear in it — but
 * the graph refuses archived types as parents at save time, and republishing
 * an archived type silently revives it, so pickers, member lists and
 * conversion targets must offer live types only. Display of existing
 * references still resolves archived types, which is why the catalogue isn't
 * filtered at the source.
 */
export const isLiveDataType = (dataType: DataTypeWithMetadata): boolean =>
  dataType.metadata.temporalVersioning.transactionTime.end.kind === "unbounded";
