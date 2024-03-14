import type { Filter, PathExpression } from "@local/hash-graph-client";

import type { Scalars } from "../../../../graphql/api-types.gen";

type QueryOperationInput = Scalars["QueryOperationInput"];
type MultiFilter = NonNullable<QueryOperationInput["multiFilter"]>;

export class InvalidEntityQueryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidEntityQueryError";
  }
}

const bpMultiFilterFieldPathToPathExpression = (
  field: MultiFilter["filters"][number]["field"],
): PathExpression => {
  return {
    path: (() => {
      const [pathRoot, ...rest] = field;

      // We check for any specially-handled paths, equivalent to the `EntityQueryToken`s

      // case `EntityQueryToken.Properties`
      if (pathRoot === "properties") {
        return ["properties", ...rest];
      }

      // case `EntityQueryToken.OwnedById`
      if (pathRoot === "ownedById") {
        if (rest.length !== 0) {
          throw new InvalidEntityQueryError(
            `Invalid filter field path, unable to add more filters on top of \`ownedById\``,
          );
        }
        return ["ownedById"];
      }

      if (pathRoot === "metadata") {
        if (rest.length === 0) {
          throw new InvalidEntityQueryError(
            `Invalid filter field path, unable to apply filters directly to \`metadata\``,
          );
        }

        const [metadataRoot, ...metadataRest] = rest;

        // case `Type`
        if (metadataRoot === "entityTypeId") {
          if (metadataRest.length > 0) {
            throw new InvalidEntityQueryError(
              `Invalid filter field path, unable to index inside \`metadata.entityTypeId\``,
            );
          }

          return ["type", "versionedUrl"];
        }

        if (metadataRoot === "entityTypeBaseUrl") {
          if (metadataRest.length > 0) {
            throw new InvalidEntityQueryError(
              `Invalid filter field path, unable to index inside \`metadata.entityTypeBaseUrl\``,
            );
          }

          return ["type", "baseUrl"];
        }

        if (metadataRoot === "recordId") {
          if (metadataRest.length === 0) {
            throw new InvalidEntityQueryError(
              `Invalid filter field path, unable to apply filters directly to \`metadata.recordId\``,
            );
          }

          const [recordIdRoot, ...recordIdRest] = metadataRest;

          if (recordIdRoot === "ownedById" || recordIdRoot === "uuid") {
            return [recordIdRoot];
          }

          if (recordIdRoot === "entityId") {
            throw new InvalidEntityQueryError(
              "Cannot query by entityId – you can filter by ownedById or uuid – entityIds are in the format 'ownedById~uuid'",
            );
          }

          // case `EditionId`
          if (recordIdRoot === "editionId") {
            if (recordIdRest.length > 0) {
              throw new InvalidEntityQueryError(
                `Invalid filter field path, unable to index inside \`metadata.recordId.editionId\``,
              );
            }

            return ["recordId", "editionId"];
          }
        }

        if (metadataRoot === "provenance") {
          if (metadataRest.length === 0) {
            throw new InvalidEntityQueryError(
              `Invalid filter field path, unable to apply filters directly to \`metadata.provenance\``,
            );
          }

          const [provenanceRoot, ...provenanceRest] = metadataRest;

          // case `EditionCreatedById`
          if (provenanceRoot === "createdById") {
            if (provenanceRest.length > 0) {
              throw new InvalidEntityQueryError(
                `Invalid filter field path, unable to index inside \`metadata.provenance.edition.createdById\``,
              );
            }
            return ["createdById"];
          }

          throw new InvalidEntityQueryError(
            `Invalid filter field path, unknown field \`${provenanceRoot}\` inside \`metadata.provenance\``,
          );
        }

        // case `Archived`
        if (metadataRoot === "archived") {
          throw new InvalidEntityQueryError(
            "Filtering by `metadata.archived` is currently not exposed, all queries will return unarchived entities",
          );
          // We short-circuit above based on the assumption that archived will be hard-coded to `false` in queries.
          // Should `archived` enter the BP spec, or this assumption change for other reasons, we should introduce a
          // check such as the following:
          // ```
          // if (metadataRest.length > 0) {
          //   throw new InvalidEntityQueryError(
          //     `Invalid filter field path, unable to index inside \`metadata.archived\``,
          //   );
          // }
          // return ["archived"];
          // ```
        }

        throw new InvalidEntityQueryError(
          `Invalid filter field path, unknown field \`${metadataRoot}\` inside \`metadata\``,
        );
      }

      if (pathRoot === "linkData") {
        const [linkDataRoot, ...linkDataRest] = rest;

        if (linkDataRest.length === 0) {
          throw new InvalidEntityQueryError(
            `Invalid filter field path, unable to apply filters directly to \`linkData\``,
          );
        }

        // case `LeftEntity` - only possible for `EntityId` as the BP query syntax doesn't support filtering across links but the EntityId is stored in the LinkData
        if (linkDataRoot === "leftEntityId") {
          if (linkDataRest.length > 0) {
            throw new InvalidEntityQueryError(
              `Invalid filter field path, unable to index inside \`linkData.leftEntityId\``,
            );
          }

          return ["linkData", "leftEntityId"];
        }

        // case `RightEntity` - only possible for `EntityId` as the BP query syntax doesn't support filtering across links but the EntityId is stored in the LinkData
        if (linkDataRoot === "rightEntityId") {
          if (linkDataRest.length > 0) {
            throw new InvalidEntityQueryError(
              `Invalid filter field path, unable to index inside \`linkData.rightEntityId\``,
            );
          }

          return ["linkData", "rightEntityId"];
        }

        // case `LeftToRightOrder`
        if (linkDataRoot === "leftToRightOrder") {
          if (linkDataRest.length > 0) {
            throw new InvalidEntityQueryError(
              `Invalid filter field path, unable to index inside \`linkData.leftToRightOrder\``,
            );
          }

          return ["linkData", "leftToRightOrder"];
        }

        // case `RightToLeftOrder`
        if (linkDataRoot === "rightToLeftOrder") {
          if (linkDataRest.length > 0) {
            throw new InvalidEntityQueryError(
              `Invalid filter field path, unable to index inside \`linkData.rightToLeftOrder\``,
            );
          }

          return ["linkData", "rightToLeftOrder"];
        }
      }

      if (pathRoot === "incomingLinks" || pathRoot === "outgoingLinks") {
        return field;
      }

      throw new InvalidEntityQueryError(
        `Invalid filter field path, unknown field \`${pathRoot}\``,
      );
    })(),
  };
};

const bpFilterToGraphFilter = (
  filter: MultiFilter["filters"][number],
): Filter => {
  const pathExpression = bpMultiFilterFieldPathToPathExpression(filter.field);
  switch (filter.operator) {
    case "IS_DEFINED":
      return {
        // TODO: check this against `notEqual`
        not: {
          equal: [
            pathExpression,
            // @ts-expect-error -- Our typings don't allow us to pass `null` here, when they should.
            null,
          ],
        },
      };
    case "IS_NOT_DEFINED":
      return {
        equal: [
          pathExpression,
          // @ts-expect-error -- Our typings don't allow us to pass `null` here, when they should.
          null,
        ],
      };
    case "CONTAINS_SEGMENT":
      throw new Error(
        "UNIMPLEMENTED: `CONTAINS_SEGMENT` is currently unsupported by the Graph API",
      );
    case "DOES_NOT_CONTAIN_SEGMENT":
      throw new Error(
        "UNIMPLEMENTED: `DOES_NOT_CONTAIN_SEGMENT` is currently unsupported by the Graph API",
      );
    case "EQUALS":
      return {
        equal: [
          pathExpression,
          {
            parameter: filter.value,
          },
        ],
      };
    case "DOES_NOT_EQUAL":
      return {
        not: {
          equal: [
            pathExpression,
            {
              parameter: filter.value,
            },
          ],
        },
      };
    case "STARTS_WITH":
      throw new Error(
        "UNIMPLEMENTED: `STARTS_WITH` is currently unsupported by the Graph API",
      );
    case "ENDS_WITH":
      throw new Error(
        "UNIMPLEMENTED: `ENDS_WITH` is currently unsupported by the Graph API",
      );
  }

  throw new Error(
    // @ts-expect-error -- We're dealing with data that is passed across boundaries, so someone _could_ pass us something
    //     that actually breaks with our typings. We should handle this case gracefully.
    `UNIMPLEMENTED: Unknown filter operator \`${filter.operator}\``,
  );
};

export const bpMultiFilterToGraphFilter = (bpFilter: MultiFilter): Filter => {
  const { filters: bpFilters, operator } = bpFilter;

  const filter: Filter = {
    all: [
      {
        equal: [{ path: ["archived"] }, { parameter: false }],
      },
    ],
  };

  const subFilters = bpFilters.map(bpFilterToGraphFilter);

  filter.all.push(
    operator === "AND"
      ? {
          all: subFilters,
        }
      : {
          any: subFilters,
        },
  );

  return filter;
};
