import { useQuery } from "@apollo/client";
import { getRoots } from "@blockprotocol/graph/stdlib";
import type { EntityId, VersionedUrl } from "@blockprotocol/type-system";
import { faAsterisk, faSearch } from "@fortawesome/free-solid-svg-icons";
import {
  FontAwesomeIcon,
  LoadingSpinner,
  TextField,
} from "@hashintel/design-system";
import {
  deserializeQueryEntitySubgraphResponse,
  type HashEntity,
} from "@local/hash-graph-sdk/entity";
import { convertBpFilterToGraphFilter } from "@local/hash-graph-sdk/filter";
import type { EntityStoreType } from "@local/hash-isomorphic-utils/entity-store";
import { generateEntityLabel } from "@local/hash-isomorphic-utils/generate-entity-label";
import { currentTimeInstantTemporalAxes } from "@local/hash-isomorphic-utils/graph-queries";
import {
  Box,
  InputAdornment,
  ListItemIcon,
  ListItemText,
  MenuList,
  Tooltip,
} from "@mui/material";
import type { PopupState } from "material-ui-popup-state/hooks";
import type { FunctionComponent } from "react";
import { useCallback, useEffect, useMemo, useRef } from "react";

import type {
  QueryEntitySubgraphQuery,
  QueryEntitySubgraphQueryVariables,
} from "../../../../graphql/api-types.gen";
import { queryEntitySubgraphQuery } from "../../../../graphql/queries/knowledge/entity.queries";
import { entityHasEntityTypeByBaseUrlFilter } from "../../../../shared/filters";
import { MenuItem } from "../../../../shared/ui";
import { useBlockView } from "../block-view";

type LoadEntityMenuContentProps = {
  blockEntityId: EntityId | null;
  childEntityEntityTypeId: VersionedUrl | null;
  childEntityEntityId: EntityId | null;
  closeParentContextMenu: () => void;
  popupState?: PopupState;
};

export const LoadEntityMenuContent: FunctionComponent<
  LoadEntityMenuContentProps
> = ({
  blockEntityId,
  childEntityEntityTypeId,
  childEntityEntityId,
  closeParentContextMenu,
  popupState,
}) => {
  const { data: queryResult, loading } = useQuery<
    QueryEntitySubgraphQuery,
    QueryEntitySubgraphQueryVariables
  >(queryEntitySubgraphQuery, {
    variables: {
      request: {
        filter: convertBpFilterToGraphFilter({
          filters: [
            ...(childEntityEntityTypeId
              ? [entityHasEntityTypeByBaseUrlFilter(childEntityEntityTypeId)]
              : []),
          ],
          operator: "AND",
        }),
        temporalAxes: currentTimeInstantTemporalAxes,
        traversalPaths: [
          {
            edges: [{ kind: "is-of-type" }],
          },
        ],
        includeDrafts: false,
        includePermissions: false,
      },
    },
  });

  const blockView = useBlockView();

  const searchInputRef = useRef<HTMLInputElement>(null);
  const popupWasOpen = useRef<boolean>(false);

  useEffect(() => {
    if (popupState?.isOpen && !popupWasOpen.current) {
      searchInputRef.current?.focus();
      popupWasOpen.current = true;
    } else if (!popupState?.isOpen) {
      popupWasOpen.current = false;
    }
  }, [popupState]);

  const swapEntity = useCallback(
    (targetEntity: HashEntity) => {
      if (!blockEntityId) {
        return;
      }

      /**
       * @todo properly type this part of the DraftEntity type
       * @see https://linear.app/hash/issue/H-3000
       */
      blockView.manager.replaceBlockChildEntity(
        blockEntityId,
        targetEntity as EntityStoreType,
      );
    },
    [blockView, blockEntityId],
  );

  const subgraph = useMemo(
    () =>
      queryResult
        ? deserializeQueryEntitySubgraphResponse(
            queryResult.queryEntitySubgraph,
          ).subgraph
        : undefined,
    [queryResult],
  );

  const filteredEntities = useMemo(() => {
    const uniqueEntityIds = new Set();

    const entities = subgraph ? getRoots(subgraph) : [];

    return entities.filter((entity) => {
      const targetEntityId = entity.metadata.recordId.entityId;

      // don't include the current entity the block is tied to
      if (targetEntityId === childEntityEntityId) {
        return false;
      }

      // don't include duplicates
      if (uniqueEntityIds.has(targetEntityId)) {
        return false;
      }

      uniqueEntityIds.add(targetEntityId);

      return true;
    });
  }, [subgraph, childEntityEntityId]);

  return (
    <MenuList>
      <Box sx={{ mx: 0.75 }}>
        <TextField
          placeholder="Search for entities"
          fullWidth
          size="xs"
          onKeyDown={(evt) => {
            evt.stopPropagation();
          }}
          InputProps={{
            inputRef: searchInputRef,
            startAdornment: (
              <InputAdornment position="start">
                <FontAwesomeIcon icon={faSearch} />
              </InputAdornment>
            ),

            endAdornment: loading ? (
              <InputAdornment position="start">
                <LoadingSpinner size={12} thickness={4} />
              </InputAdornment>
            ) : null,
          }}
        />
      </Box>
      {loading ? (
        <Box padding={2}>
          <LoadingSpinner size={16} thickness={4} />
        </Box>
      ) : null}
      {subgraph &&
        filteredEntities.map((entity) => {
          return (
            <MenuItem
              key={entity.metadata.recordId.entityId}
              onClick={() => {
                swapEntity(entity);
                closeParentContextMenu();
              }}
            >
              <ListItemIcon>
                <FontAwesomeIcon icon={faAsterisk} />
              </ListItemIcon>
              <Tooltip title={JSON.stringify(entity.properties, undefined, 2)}>
                <ListItemText
                  primary={generateEntityLabel(subgraph, entity)}
                  primaryTypographyProps={{
                    noWrap: true,
                  }}
                />
              </Tooltip>
            </MenuItem>
          );
        })}
    </MenuList>
  );
};
