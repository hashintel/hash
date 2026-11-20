import { groupConversionRowStates } from "../conversion-util";

import type {
  ConversionOperator,
  GroupConversionRowState,
} from "../conversion-util";
import type { StagedDataTypeDraft } from "./staged-drafts";
import type { BaseUrl, DataTypeWithMetadata } from "@blockprotocol/type-system";

/** A group-card edit to one row's conversion step, value empty mid-edit */
export type SimpleConversionEdit = {
  operator: ConversionOperator;
  value: number | null;
};

/**
 * A reopened staged group's packed member-conversion edits, re-expressed as
 * the card's edit state: diffs against the members' saved rows become
 * overrides and removals, additions become new rows.
 */
export const seedGroupCardEdits = ({
  memberConversionRows,
  latestDataTypes,
}: {
  memberConversionRows: NonNullable<
    StagedDataTypeDraft["memberConversionRows"]
  >;
  latestDataTypes: Record<BaseUrl, DataTypeWithMetadata>;
}): {
  overrides: Map<string, SimpleConversionEdit | "removed">;
  newRows: GroupConversionRowState[];
} => {
  const overrides = new Map<string, SimpleConversionEdit | "removed">();
  const newRows: GroupConversionRowState[] = [];
  let nextNewKey = 0;

  for (const { childBaseUrl, rows } of memberConversionRows) {
    const baseRows = groupConversionRowStates({
      childBaseUrls: [childBaseUrl],
      latestDataTypes,
    });
    const packedByTarget = new Map(rows.map((row) => [row.targetBaseUrl, row]));

    for (const base of baseRows) {
      if (base.viaCanonical || base.formula || base.targetBaseUrl === null) {
        continue;
      }
      const packed = packedByTarget.get(base.targetBaseUrl);
      if (!packed) {
        overrides.set(base.key, "removed");
        continue;
      }
      packedByTarget.delete(base.targetBaseUrl);
      if (packed.operator !== base.operator || packed.value !== base.value) {
        overrides.set(base.key, {
          operator: packed.operator,
          value: packed.value,
        });
      }
    }

    for (const packed of packedByTarget.values()) {
      newRows.push({
        key: `new-${nextNewKey++}`,
        childBaseUrl,
        targetBaseUrl: packed.targetBaseUrl,
        operator: packed.operator,
        value: packed.value,
        storedOnBaseUrl: null,
        viaCanonical: false,
        formula: false,
      });
    }
  }

  return { overrides, newRows };
};
