import { getFileProperties } from "../../../../shared/get-file-properties";

import type { FlowRun } from "../../../../../graphql/api-types.gen";
import type { DeliverableData } from "./outputs/deliverables/shared/types";
import type { HashEntity } from "@local/hash-graph-sdk/entity";

export const getDeliverables = (
  outputs: FlowRun["outputs"] | undefined,
  persistedEntities: HashEntity[],
): DeliverableData[] => {
  const flowOutputs = outputs?.[0]?.contents[0]?.outputs;

  const deliverables: DeliverableData[] = [];

  for (const output of flowOutputs ?? []) {
    const { payload } = output;

    if (payload.kind === "FormattedText" && !Array.isArray(payload.value)) {
      if (payload.value.format === "Markdown") {
        const markdown = payload.value.content;
        deliverables.push({
          displayName: "Markdown",
          type: "markdown",
          markdown,
        });
      }
    }

    if (
      payload.kind === "PersistedEntityMetadata" &&
      !Array.isArray(payload.value)
    ) {
      const persistedEntityId = payload.value.entityId;
      if (!persistedEntityId) {
        continue;
      }

      const entity = persistedEntities.find(
        (persisted) => persisted.entityId === persistedEntityId,
      );

      if (!entity) {
        continue;
      }

      const { displayName, fileName, fileUrl } = getFileProperties(
        entity.properties,
      );

      if (fileUrl) {
        deliverables.push({
          displayName,
          entityTypeId: entity.metadata.entityTypeIds[0],
          fileName,
          fileUrl,
          type: "file",
        });
      }
    }
  }

  return deliverables;
};
