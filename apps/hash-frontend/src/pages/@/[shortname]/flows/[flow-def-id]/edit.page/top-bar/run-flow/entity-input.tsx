import { useQuery } from "@apollo/client";
import { useMemo } from "react";

import { Combobox } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";
import {
  deserializeQueryEntitiesResponse,
  getClosedMultiEntityTypeFromMap,
} from "@local/hash-graph-sdk/entity";
import { generateEntityLabel } from "@local/hash-isomorphic-utils/generate-entity-label";
import { currentTimeInstantTemporalAxes } from "@local/hash-isomorphic-utils/graph-queries";

import { queryEntitiesQuery } from "../../../../../../../../graphql/queries/knowledge/entity.queries";
import { getKindIcon } from "../../shared/value-display";

import type {
  QueryEntitiesQuery,
  QueryEntitiesQueryVariables,
} from "../../../../../../../../graphql/api-types.gen";
import type { RunFormValue } from "./run-form";
import type { EntityId, WebId } from "@blockprotocol/type-system";

/** The most entities offered, the web's last edited first. */
const maxEntities = 500;

const typeTitleText = css({
  color: "fg.subtle",
  ml: "2",
  whiteSpace: "nowrap",
});

/**
 * The entities in the web to pick from, by label: not archived, and not drafts or links. The typed text is matched
 * here, not by the graph, which can only match it case-sensitively against a given property, while an entity's label
 * comes from whichever property its type labels it with, or else a fallback.
 */
const useWebEntities = (webId: WebId) => {
  const { data, loading } = useQuery<
    QueryEntitiesQuery,
    QueryEntitiesQueryVariables
  >(queryEntitiesQuery, {
    variables: {
      request: {
        filter: {
          all: [
            { equal: [{ path: ["webId"] }, { parameter: webId }] },
            { equal: [{ path: ["archived"] }, { parameter: false }] },
            /* A link entity is exactly one with a left endpoint. */
            { not: { exists: { path: ["leftEntity", "uuid"] } } },
          ],
        },
        sortingPaths: [
          {
            path: ["editionCreatedAtTransactionTime"],
            ordering: "descending",
            nulls: "last",
          },
        ],
        /* One more than is offered, to tell whether the web has more. */
        limit: maxEntities + 1,
        temporalAxes: currentTimeInstantTemporalAxes,
        includeDrafts: false,
        includeEntityTypes: "resolved",
        includePermissions: false,
      },
    },
    fetchPolicy: "cache-and-network",
  });

  const { options, more } = useMemo((): {
    options: Map<EntityId, { label: string; typeTitle: string }>;
    more: boolean;
  } => {
    if (!data) {
      return { options: new Map(), more: false };
    }

    const { entities, closedMultiEntityTypes } =
      deserializeQueryEntitiesResponse(data.queryEntities);

    return {
      options: new Map(
        entities.slice(0, maxEntities).map((entity) => {
          const entityId = entity.metadata.recordId.entityId;
          const closedType = closedMultiEntityTypes
            ? getClosedMultiEntityTypeFromMap(
                closedMultiEntityTypes,
                entity.metadata.entityTypeIds,
              )
            : null;

          return [
            entityId,
            {
              label: generateEntityLabel(closedType, entity),
              typeTitle:
                closedType?.allOf.map(({ title }) => title).join(", ") ?? "",
            },
          ];
        }),
      ),
      more: entities.length > maxEntities,
    };
  }, [data]);

  const items = useMemo(
    () =>
      [...options].map(([entityId, { label }]) => ({
        value: entityId,
        text: label,
      })),
    [options],
  );

  return { options, items, loading, more };
};

/** Picks an entity in the web for a flow input, or several for a list. A pick shows its label, and can be removed. */
export const EntityInput = ({
  webId,
  value,
  required,
  invalid,
  onChange,
}: {
  webId: WebId;
  value: Extract<RunFormValue, { kind: "EntityId" }>;
  required: boolean;
  invalid: boolean;
  onChange: (value: RunFormValue) => void;
}) => {
  const { options, items, loading, more } = useWebEntities(webId);

  const shared = {
    items,
    /* The type tells apart entities with the same label, as the search spans every type. */
    renderItem: (entityId: EntityId) => (
      <span>
        {options.get(entityId)?.label ?? entityId}
        <span className={typeTitleText}>
          {options.get(entityId)?.typeTitle}
        </span>
      </span>
    ),
    renderSelectedItem: (entityId: EntityId) =>
      options.get(entityId)?.label ?? entityId,
    loading,
    invalid,
    prefix: {
      iconName: getKindIcon({ payloadKind: "EntityId", array: value.array }),
      variant: "subtle",
    } as const,
    emptyState: loading
      ? "Loading the web's entities…"
      : "There are no entities in this web",
    noMatchMessage: (input: string) =>
      more
        ? `None of the ${maxEntities} entities last edited in this web match “${input}”`
        : `No entities match “${input}”`,
  };

  return value.array ? (
    <Combobox
      {...shared}
      multiple
      required={required}
      placeholder="Choose entities"
      value={value.value}
      onChange={(entityIds) =>
        onChange({ kind: "EntityId", array: true, value: entityIds })
      }
    />
  ) : (
    /* Not `required`, so that a pick can always be cleared. */
    <Combobox
      {...shared}
      placeholder="Choose an entity"
      value={value.value}
      onChange={(entityId) =>
        onChange({ kind: "EntityId", array: false, value: entityId })
      }
    />
  );
};
