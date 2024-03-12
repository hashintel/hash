import type { EntityType, VersionedUrl } from "@blockprotocol/type-system";
import { typedEntries, typedKeys } from "@local/advanced-types/typed-entries";
import { isDraftEntity } from "@local/hash-isomorphic-utils/entity-store";
import { generateEntityLabel } from "@local/hash-isomorphic-utils/generate-entity-label";
import { blockProtocolEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import { stringifyPropertyValue } from "@local/hash-isomorphic-utils/stringify-property-value";
import type {
  BaseUrl,
  EntityId,
  EntityRootType,
  EntityVertex,
  Subgraph,
} from "@local/hash-subgraph";
import { isEntityVertex } from "@local/hash-subgraph";
import {
  getEntityRevision,
  getEntityTypeAndParentsById,
  getEntityTypeById,
  getPropertyTypeForEntity,
} from "@local/hash-subgraph/stdlib";
import type { sheets_v4 } from "googleapis";

type SheetOutputFormat = {
  audience: "human" | "machine";
};

type ColumnsForEntity = {
  columns: Record<
    string,
    {
      columnLetter: string;
      label: string;
      baseOrVersionedUrl?: string;
    }
  >;
  baseColumnCount: number;
  isLinkType: boolean;
  linkColumnCount: number;
  propertyColumnCount: number;
};

const columnIndexToColumnLetters = (columnIndex: number): string => {
  let columnLetters = "";
  let unprocessedColumnIndex = columnIndex;
  while (unprocessedColumnIndex >= 0) {
    const remainder = unprocessedColumnIndex % 26;
    columnLetters = String.fromCharCode(65 + remainder) + columnLetters;
    unprocessedColumnIndex = Math.floor(unprocessedColumnIndex / 26) - 1;
  }
  return columnLetters;
};

const createColumnsForEntity = (
  entityType: EntityType,
  subgraph: Subgraph,
  format: SheetOutputFormat,
): ColumnsForEntity => {
  const { audience } = format;
  const humanReadable = audience === "human";

  const columns: ColumnsForEntity["columns"] = {
    entityId: {
      columnLetter: "A",
      label: humanReadable ? "Entity Id" : "entityId",
    },
    label: {
      columnLetter: "B",
      label: humanReadable ? "Label" : "label",
    },
    editionCreatedAt: {
      columnLetter: "C",
      label: humanReadable ? "Edition Created At" : "editionCreatedAt",
    },
    entityCreatedAt: {
      columnLetter: "D",
      label: humanReadable ? "Entity Created At" : "entityCreatedAt",
    },
    draft: {
      columnLetter: "E",
      label: humanReadable ? "Draft" : "draft",
    },
  };

  const baseColumnCount = Object.keys(columns).length;

  let nextColumnIndex = baseColumnCount;

  const entityTypeAndParents = getEntityTypeAndParentsById(
    subgraph,
    entityType.$id,
  );

  const properties = new Set<BaseUrl>();
  const links = new Set<VersionedUrl>();

  for (const { schema } of entityTypeAndParents) {
    for (const baseUrl of typedKeys(schema.properties)) {
      properties.add(baseUrl as BaseUrl);
    }
    for (const linkTypeId of typedKeys(schema.links ?? {})) {
      links.add(linkTypeId);
    }
  }

  const isLinkType = entityTypeAndParents.some(
    (ancestor) =>
      ancestor.schema.$id === blockProtocolEntityTypes.link.entityTypeId,
  );

  if (isLinkType) {
    columns.leftEntityId = {
      columnLetter: columnIndexToColumnLetters(nextColumnIndex),
      label: humanReadable ? "Source Entity Id" : "leftEntityId",
    };
    nextColumnIndex++;
    columns.rightEntityId = {
      columnLetter: columnIndexToColumnLetters(nextColumnIndex),
      label: humanReadable ? "Target Entity Id" : "rightEntityId",
    };
    nextColumnIndex++;
  }

  const baseAndLinkDataColumnCount = nextColumnIndex;

  for (const baseUrl of [...properties]) {
    const { propertyType } = getPropertyTypeForEntity(
      subgraph,
      entityType.$id,
      baseUrl,
    );
    columns[`properties.${baseUrl}`] = {
      baseOrVersionedUrl: baseUrl,
      columnLetter: columnIndexToColumnLetters(nextColumnIndex),
      label: humanReadable ? propertyType.title : `properties.${baseUrl}`,
    };
    nextColumnIndex++;
  }

  const propertyColumnCount = nextColumnIndex - baseAndLinkDataColumnCount;

  for (const linkTypeId of [...links]) {
    const linkEntityType = getEntityTypeById(subgraph, linkTypeId);
    if (!linkEntityType) {
      throw new Error(`Link type ${linkTypeId} not found in subgraph`);
    }

    columns[`links.${linkTypeId}`] = {
      baseOrVersionedUrl: linkTypeId,
      columnLetter: columnIndexToColumnLetters(nextColumnIndex),
      label: humanReadable
        ? linkEntityType.schema.title
        : `links.${linkTypeId}`,
    };
    nextColumnIndex++;
  }

  const linkColumnCount =
    nextColumnIndex - propertyColumnCount - baseAndLinkDataColumnCount;

  return {
    baseColumnCount,
    isLinkType,
    linkColumnCount,
    propertyColumnCount,
    columns,
  };
};

const cellPadding = {
  top: 8,
  bottom: 8,
  right: 8,
  left: 8,
};

const createHyperlinkCell = ({
  label,
  sheetId,
  startCellInclusive,
  endCellInclusive,
}: {
  label: string;
  sheetId: number;
  startCellInclusive: string;
  endCellInclusive: string;
}) => ({
  userEnteredValue: {
    formulaValue: `=HYPERLINK("#gid=${sheetId}&range=${startCellInclusive}:${endCellInclusive}", "${label}")`,
  },
  userEnteredFormat: {
    padding: cellPadding,
  },
});

const createCellFromValue = (value: unknown): sheets_v4.Schema$CellData => {
  const userEnteredFormat = { padding: cellPadding };
  switch (typeof value) {
    case "number": {
      return {
        userEnteredValue: {
          numberValue: value,
        },
        userEnteredFormat,
      };
    }
    case "boolean": {
      return {
        userEnteredValue: {
          boolValue: value,
        },
        userEnteredFormat,
      };
    }
    default: {
      return {
        userEnteredValue: {
          stringValue: stringifyPropertyValue(value),
        },
        userEnteredFormat,
      };
    }
  }
};

type EntitySheetRequests = {
  [typeId: string]: {
    additionalRequests: sheets_v4.Schema$Request[];
    columns: ColumnsForEntity["columns"];
    sheetId: number;
    rows: sheets_v4.Schema$RowData[];
    typeTitle: string;
    typeVersion: number;
  };
};

/**
 * Create requests to the Google Sheets API to create a sheet for each entity type in the subgraph.
 *
 * This function could later return an abstraction of sheet requests (e.g. Create Sheet, Insert Rows)
 * to be converted into calls to different spreadsheet APIs.
 */
export const createSheetRequestsFromEntitySubgraph = (
  entitySubgraph: Subgraph<EntityRootType>,
  format: SheetOutputFormat,
): sheets_v4.Schema$Request[] => {
  const entitySheetRequests: EntitySheetRequests = {};

  const sortedEntities = Object.values(entitySubgraph.vertices)
    .flatMap((editionMap) => Object.values(editionMap))
    .filter((vertex): vertex is EntityVertex => isEntityVertex(vertex))
    .map((vertex) => vertex.inner)
    .sort((aEntity, bEntity) => {
      /**
       * Sort entities with linkData to the end, so we know the sheets position of the entities they reference
       * by the time we process them, to allow for linking to the rows with the source and target entity
       */
      if (aEntity.linkData && !bEntity.linkData) {
        return 1;
      }
      if (!aEntity.linkData && bEntity.linkData) {
        return -1;
      }

      /** Within link entities, sort them by the source (left) entityId, so we can link to a range of rows from the source */
      if (aEntity.linkData && bEntity.linkData) {
        return aEntity.linkData.leftEntityId.localeCompare(
          bEntity.linkData.leftEntityId,
        );
      }

      /**
       * Within entities without linkData, sort them by their entityId, and then by the edition createdAt time (in case
       * of multiple editions)
       */
      return (
        aEntity.metadata.recordId.entityId.localeCompare(
          bEntity.metadata.recordId.entityId,
        ) ||
        new Date(
          aEntity.metadata.temporalVersioning.decisionTime.start.limit,
        ).valueOf() -
          new Date(
            bEntity.metadata.temporalVersioning.decisionTime.start.limit,
          ).valueOf()
      );
    });

  /**
   * Stores the first rows an entity appears in (there may be more rows that follow if multiple editions are present)
   * Allows for linking from the link type's sheet to the entity's sheet in human-readable formatting.
   */
  const entityPositionMap: {
    [entityId: EntityId]: {
      sheetId: number;
      rowIndex: number;
      lastColumnLetter: string;
    };
  } = {};

  /**
   * Store the range of rows in a link type's sheet that contain the outgoing links from an entity of that type.
   * Allows for linking from the entity's sheet to the link type's sheet in human-readable formatting.
   */
  const entityOutgoingLinkRangeByLinkTypeId: {
    [entityId: EntityId]: {
      [linkTypeId: VersionedUrl]: {
        sourceColumnIndex: number;
        sheetId?: number;
        startRowIndex?: number;
        endRowIndex?: number;
        lastColumnLetter?: string;
      };
    };
  } = {};

  const humanReadable = format.audience === "human";

  for (const entity of sortedEntities) {
    const entityType = getEntityTypeById(
      entitySubgraph,
      entity.metadata.entityTypeId,
    );
    if (!entityType) {
      throw new Error(
        `Entity type ${entity.metadata.entityTypeId} not found for entity ${entity.metadata.recordId.entityId}`,
      );
    }

    const typeTitle = entityType.schema.title;
    const typeId = entityType.schema.$id;
    const typeVersion = entityType.metadata.recordId.version;

    const {
      columns,
      baseColumnCount,
      isLinkType,
      linkColumnCount,
      propertyColumnCount,
    } = createColumnsForEntity(entityType.schema, entitySubgraph, format);

    /**
     * If we haven't yet created a sheet for this entity type, add it to the map and add its header row(s)
     */
    if (!entitySheetRequests[typeId]) {
      const sheetId = Object.keys(entitySheetRequests).length;

      const borderStyle = {
        style: "SOLID",
        colorStyle: {
          rgbColor: {
            red: 0,
            green: 0,
            blue: 0,
          },
        },
      };

      const backgroundStyle: sheets_v4.Schema$CellFormat = {
        backgroundColorStyle: {
          rgbColor: {
            red: 0.92,
            green: 0.94,
            blue: 1,
          },
        },
      };

      const headerRow = Object.values(columns).map(({ label }, index) => {
        const endOfGroup =
          index === baseColumnCount - 1 ||
          (isLinkType
            ? index === baseColumnCount + 1 ||
              index === baseColumnCount + propertyColumnCount + 1 ||
              index ===
                baseColumnCount + propertyColumnCount + linkColumnCount + 1
            : index === baseColumnCount + propertyColumnCount - 1 ||
              index ===
                baseColumnCount + propertyColumnCount + linkColumnCount - 1);

        return {
          userEnteredValue: {
            stringValue: label,
          },
          ...(humanReadable
            ? {
                userEnteredFormat: {
                  textFormat: {
                    bold: true,
                  },
                  borders: {
                    ...(endOfGroup ? { right: borderStyle } : {}),
                  },
                  padding: cellPadding,
                  ...backgroundStyle,
                },
              }
            : {}),
        };
      });

      const additionalRequests: sheets_v4.Schema$Request[] = [];

      const headerRows: sheets_v4.Schema$RowData[] = [{ values: headerRow }];

      const groupHeaderFormat: sheets_v4.Schema$CellFormat = {
        textFormat: {
          bold: true,
        },
        borders: {
          right: borderStyle,
        },
        horizontalAlignment: "CENTER",
        padding: cellPadding,
        ...backgroundStyle,
      };

      if (humanReadable) {
        /** For human audiences we'll add group headers across groups of columns */
        const groupHeaderCells: sheets_v4.Schema$CellData[] = [];

        /** First, the metadata columns common to all entities */
        groupHeaderCells.push({
          userEnteredValue: {
            stringValue: "Metadata",
          },
          userEnteredFormat: groupHeaderFormat,
        });
        groupHeaderCells.push(...Array(baseColumnCount - 1).fill({}));

        additionalRequests.push({
          mergeCells: {
            range: {
              sheetId,
              startRowIndex: 0,
              endRowIndex: 1,
              startColumnIndex: 0,
              endColumnIndex: baseColumnCount, // endColumnIndex is exclusive
            },
            mergeType: "MERGE_ALL",
          },
        });

        if (isLinkType) {
          const startColumnIndex = baseColumnCount;

          /** If it's a link entity, we also have two cells for source and target entityIds */
          groupHeaderCells.push({
            userEnteredValue: {
              stringValue: "Link Data",
            },
            userEnteredFormat: groupHeaderFormat,
          });
          groupHeaderCells.push(...Array(1).fill({}));

          additionalRequests.push({
            mergeCells: {
              range: {
                sheetId,
                startRowIndex: 0,
                endRowIndex: 1,
                startColumnIndex,
                endColumnIndex: startColumnIndex + 2, // endColumnIndex is exclusive
              },
              mergeType: "MERGE_ALL",
            },
          });
        }

        if (propertyColumnCount > 0) {
          const startColumnIndex = groupHeaderCells.length;

          /** Now the properties */
          groupHeaderCells.push({
            userEnteredValue: {
              stringValue: "Properties",
            },
            userEnteredFormat: groupHeaderFormat,
          });
          groupHeaderCells.push(...Array(propertyColumnCount - 1).fill({}));

          additionalRequests.push({
            mergeCells: {
              range: {
                sheetId,
                startRowIndex: 0,
                endRowIndex: 1,
                startColumnIndex,
                endColumnIndex: startColumnIndex + propertyColumnCount, // endColumnIndex is exclusive
              },
              mergeType: "MERGE_ALL",
            },
          });
        }

        if (linkColumnCount > 0) {
          const startColumnIndex = groupHeaderCells.length;

          /** Finally, cells for each potential link from the entity, which will link to a range in the link type's sheet */
          groupHeaderCells.push({
            userEnteredValue: {
              stringValue: "Links",
            },
            userEnteredFormat: groupHeaderFormat,
          });
          groupHeaderCells.push(...Array(linkColumnCount - 1).fill({}));

          additionalRequests.push({
            mergeCells: {
              range: {
                sheetId,
                startRowIndex: 0,
                endRowIndex: 1,
                startColumnIndex,
                endColumnIndex: startColumnIndex + linkColumnCount, // endColumnIndex is exclusive
              },
              mergeType: "MERGE_ALL",
            },
          });
        }

        headerRows.unshift({ values: groupHeaderCells });
      }

      entitySheetRequests[typeId] = {
        additionalRequests,
        columns,
        rows: headerRows,
        sheetId,
        typeTitle,
        typeVersion,
      };
    }
    /** Done initialising the sheet if we hadn't already */

    const thisRowIndex = entitySheetRequests[typeId]!.rows.length;

    const lastColumnLetter = columnIndexToColumnLetters(
      Object.keys(columns).length - 1,
    );

    /**
     * Store this entity's position in the sheet, so we can link to it from sheets for link types.
     * If there are multiple editions this will just link to the first.
     */
    entityPositionMap[entity.metadata.recordId.entityId] = {
      sheetId: entitySheetRequests[typeId]!.sheetId,
      rowIndex: thisRowIndex,
      lastColumnLetter,
    };

    /**
     * Initialise the map of ranges in link type sheets that link from this entity.
     */
    entityOutgoingLinkRangeByLinkTypeId[entity.metadata.recordId.entityId] = {};

    const entityCells: sheets_v4.Schema$CellData[] = [];

    for (const key of Object.keys(columns)) {
      if (key === "entityId") {
        entityCells.push(
          createCellFromValue(entity.metadata.recordId.entityId),
        );
      } else if (key === "label") {
        entityCells.push(
          createCellFromValue(generateEntityLabel(entitySubgraph, entity)),
        );
      } else if (key === "editionCreatedAt") {
        entityCells.push(
          createCellFromValue(
            entity.metadata.temporalVersioning.decisionTime.start.limit,
          ),
        );
      } else if (key === "entityCreatedAt") {
        entityCells.push(
          createCellFromValue(entity.metadata.provenance.createdAtDecisionTime),
        );
      } else if (key === "draft") {
        entityCells.push(createCellFromValue(isDraftEntity(entity)));
      } else if (key.startsWith("properties.")) {
        const propertyKey = columns[key]!.baseOrVersionedUrl;
        const value = entity.properties[propertyKey as BaseUrl];
        entityCells.push(createCellFromValue(value));
      } else if (key === "leftEntityId") {
        const leftEntityId = entity.linkData?.leftEntityId;
        if (leftEntityId) {
          const entityPosition = entityPositionMap[leftEntityId];
          if (humanReadable && entityPosition) {
            /**
             * If this is a human-readable sheet, we want to:
             * 1. Link from the link type's sheet to the range in the entity's sheet
             * 2. Track the rows in the link type's sheet that link from this entity,
             *    and insert a link to the range in the entity's sheet when we have all the rows.
             * If we can't find the linked entity in the sheet (no entityPosition), we go to the else branch and just
             * list the id. It might be excluded from the query due to permissions, archive or draft status.
             */
            const { sheetId, rowIndex } = entityPosition;
            const linkedEntity = getEntityRevision(
              entitySubgraph,
              leftEntityId,
            );

            /** Create the link from this sheet to the source entity */
            entityCells.push(
              createHyperlinkCell({
                label: generateEntityLabel(entitySubgraph, linkedEntity),
                sheetId,
                startCellInclusive: `A${rowIndex + 1}`,
                endCellInclusive: `${entityPosition.lastColumnLetter}${rowIndex + 1}`,
              }),
            );

            /**
             * Track the range of rows in this link type's sheet that have a specific entity as the source.
             * We sorted link entities by leftEntityId, so we know it will be an unbroken series in this sheet.
             */
            const outgoingLinkMapForLeftEntity =
              entityOutgoingLinkRangeByLinkTypeId[leftEntityId]?.[typeId];
            if (!outgoingLinkMapForLeftEntity) {
              throw new Error(
                `Outgoing link map for entity ${leftEntityId} somehow not initialized by the time ${typeId} links were processed`,
              );
            }
            if (!outgoingLinkMapForLeftEntity.sheetId) {
              /**
               * This is the first time we've seen this entity as a source in this sheet, set the sheetId and start
               * index
               */
              outgoingLinkMapForLeftEntity.sheetId =
                entitySheetRequests[typeId]!.sheetId;
              outgoingLinkMapForLeftEntity.startRowIndex = thisRowIndex;
              outgoingLinkMapForLeftEntity.lastColumnLetter = lastColumnLetter;
            }
            /** Set the end index. We'll keep updating this until we no longer see the entity as a source */
            outgoingLinkMapForLeftEntity.endRowIndex = thisRowIndex;
          } else {
            /**
             * We're not in human-readable format or we can't find the source entity, just show its id.
             */
            entityCells.push(
              createCellFromValue(entity.linkData?.leftEntityId ?? ""),
            );
          }
        }
      } else if (key === "rightEntityId") {
        const rightEntityId = entity.linkData?.rightEntityId;

        if (rightEntityId) {
          const entityPosition = entityPositionMap[rightEntityId];

          if (humanReadable && entityPosition) {
            const { sheetId, rowIndex } = entityPosition;

            const linkedEntity = getEntityRevision(
              entitySubgraph,
              rightEntityId,
            );

            entityCells.push(
              createHyperlinkCell({
                label: generateEntityLabel(entitySubgraph, linkedEntity),
                sheetId,
                startCellInclusive: `A${rowIndex + 1}`,
                endCellInclusive: `${entityPosition.lastColumnLetter}${rowIndex + 1}`,
              }),
            );
          } else {
            entityCells.push(
              createCellFromValue(entity.linkData?.rightEntityId ?? ""),
            );
          }
        }
      } else if (key.startsWith("links.")) {
        /**
         * At this point we just need to initialize the map where we'll insert the range for each type of outgoing link
         * from this entity.
         * – when we process the link entities, we'll add a link in these cells to the range in the link type's sheet
         * (see leftEntityId above)
         */
        entityOutgoingLinkRangeByLinkTypeId[entity.metadata.recordId.entityId]![
          columns[key]!.baseOrVersionedUrl as VersionedUrl
        ] = {
          sourceColumnIndex: Object.keys(columns).indexOf(key),
        };
      } else {
        throw new Error(`Unexpected column key ${key}`);
      }
    }

    entitySheetRequests[typeId]!.rows.push({ values: entityCells });
  }

  const requests: sheets_v4.Schema$Request[] = [];

  for (const [
    typeId,
    { additionalRequests, sheetId, rows, typeTitle },
  ] of Object.entries(entitySheetRequests)) {
    // @todo add discriminator to sheet titles to differentiate between types with identical titles, for human readers
    // const typesWithIdenticalTitles = Object.entries(entitySheetRequests).filter(
    //   ([_typeId, entitySheetRequest]) =>
    //     entitySheetRequest.typeTitle === typeTitle,
    // );

    requests.push(
      ...[
        {
          addSheet: {
            properties: {
              gridProperties: {
                frozenRowCount: format.audience === "human" ? 2 : 0,
              },
              sheetId,
              title: format.audience === "human" ? typeTitle : typeId,
            },
          },
        },
        {
          updateCells: {
            fields: "*",
            range: {
              sheetId,
              startRowIndex: 0,
            },
            rows,
          },
        },
        ...(humanReadable
          ? [
              {
                setBasicFilter: {
                  filter: {
                    range: {
                      sheetId,
                      startRowIndex: 1,
                      endRowIndex: rows.length,
                      startColumnIndex: 0,
                      endColumnIndex: rows[0]?.values?.length ?? 0,
                    },
                  },
                },
              },
            ]
          : []),
        /**
         * This will show a warning when the user tries to edit the sheet, including:
         * 1. Editing / deleting a cell
         * 2. Sorting the sheet
         * 3. Resizing the columns / rows
         * Disabling for now as it's annoying and we aren't relying on the content/position of the cells,
         * we just overwrite them each time. Might be useful when we start reading from the sheets, e.g. for 2-way sync.
         */
        // {
        //   addProtectedRange: {
        //     protectedRange: {
        //       range: {
        //         sheetId,
        //         startRowIndex: 0,
        //         endRowIndex: rows.length,
        //         startColumnIndex: 0,
        //         endColumnIndex: rows[0]?.values?.length ?? 0,
        //       },
        //       warningOnly: true,
        //     },
        //   },
        // },
        ...additionalRequests,
      ],
    );
  }

  if (humanReadable) {
    /**
     * Add links from source entity rows to the range of links from them in the link type's sheet
     */
    for (const [entityId, outgoingLinkRanges] of typedEntries(
      entityOutgoingLinkRangeByLinkTypeId,
    )) {
      const entityPosition = entityPositionMap[entityId];
      if (!entityPosition) {
        continue;
      }

      for (const [_linkTypeId, outgoingLinkRange] of Object.entries(
        outgoingLinkRanges,
      )) {
        if (
          outgoingLinkRange.sheetId !== undefined &&
          outgoingLinkRange.startRowIndex !== undefined &&
          outgoingLinkRange.endRowIndex !== undefined &&
          outgoingLinkRange.lastColumnLetter !== undefined
        ) {
          requests.push({
            updateCells: {
              fields: "*",
              range: {
                sheetId: entityPosition.sheetId,
                startRowIndex: entityPosition.rowIndex,
                endRowIndex: entityPosition.rowIndex + 1,
                startColumnIndex: outgoingLinkRange.sourceColumnIndex,
                endColumnIndex: outgoingLinkRange.sourceColumnIndex + 1,
              },
              rows: [
                {
                  values: [
                    createHyperlinkCell({
                      label: `View links`,
                      sheetId: outgoingLinkRange.sheetId,
                      startCellInclusive: `A${outgoingLinkRange.startRowIndex + 1}`,
                      endCellInclusive: `${outgoingLinkRange.lastColumnLetter}${outgoingLinkRange.endRowIndex + 1}`,
                    }),
                  ],
                },
              ],
            },
          });
        }
      }
    }
  }

  if (humanReadable) {
    /** Fit columns to the maximum width of their content */
    requests.push(
      ...Object.values(entitySheetRequests).map(({ sheetId }) => ({
        autoResizeDimensions: {
          dimensions: {
            sheetId,
            dimension: "COLUMNS",
          },
        },
      })),
    );
  }

  return requests;
};
