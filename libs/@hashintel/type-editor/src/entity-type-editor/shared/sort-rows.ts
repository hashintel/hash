import type { VersionedUrl } from "@blockprotocol/type-system";

/**
 * The shape of data for properties/links is slightly different, but the sort logic is
 * the same. This is a generic sort function which maps from a react hook form
 * field array to an object preserving the original index and sorting by title
 */
export const sortRows = <V, R extends { $id: VersionedUrl }>(
  rows: R[],
  resolveRow: ($id: VersionedUrl) => V | undefined,
  resolveTitle: (row: V) => string,
) =>
  rows
    .map((field, index) => {
      const row = resolveRow(field.$id);
      return { field, row, index, title: row ? resolveTitle(row) : null };
    })
    .sort((a, b) => {
      if (a.title === null && b.title === null) {
        return 0;
      }
      if (a.title === null) {
        return 1;
      }
      if (b.title === null) {
        return -1;
      }
      return a.title.localeCompare(b.title);
    });
