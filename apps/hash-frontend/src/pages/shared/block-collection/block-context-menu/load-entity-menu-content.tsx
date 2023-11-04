import { useQuery } from "@apollo/client";
import { VersionedUrl } from "@blockprotocol/type-system/slim";
import { faAsterisk, faSearch } from "@fortawesome/free-solid-svg-icons";
import {
  FontAwesomeIcon,
  LoadingSpinner,
  TextField,
} from "@hashintel/design-system";
import { mapGqlSubgraphFieldsFragmentToSubgraph } from "@local/hash-graphql-shared/graphql/types";
import { EntityStoreType } from "@local/hash-isomorphic-utils/entity-store";
import { Entity, EntityId, EntityRootType } from "@local/hash-subgraph";
import { getRoots } from "@local/hash-subgraph/stdlib";
import {
  Box,
  InputAdornment,
  ListItemIcon,
  ListItemText,
  MenuList,
  Tooltip,
} from "@mui/material";
import { PopupState } from "material-ui-popup-state/hooks";
import {
  FunctionComponent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from "react";

import {
  QueryEntitiesQuery,
  QueryEntitiesQueryVariables,
} from "../../../../graphql/api-types.gen";
import { queryEntitiesQuery } from "../../../../graphql/queries/knowledge/entity.queries";
import { generateEntityLabel } from "../../../../lib/entities";
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
    QueryEntitiesQuery,
    QueryEntitiesQueryVariables
  >(queryEntitiesQuery, {
    variables: {
      includePermissions: false,
      operation: {
        multiFilter: {
          filters: [
            ...(childEntityEntityTypeId
              ? [entityHasEntityTypeByBaseUrlFilter(childEntityEntityTypeId)]
              : []),
          ],
          operator: "AND",
        },
      },
      constrainsValuesOn: { outgoing: 0 },
      constrainsPropertiesOn: { outgoing: 0 },
      constrainsLinksOn: { outgoing: 0 },
      constrainsLinkDestinationsOn: { outgoing: 0 },
      inheritsFrom: { outgoing: 0 },
      isOfType: { outgoing: 1 },
      hasLeftEntity: { incoming: 0, outgoing: 0 },
      hasRightEntity: { incoming: 0, outgoing: 0 },
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
    (targetEntity: Entity) => {
      if (!blockEntityId) {
        return;
      }

      /** @todo properly type this part of the DraftEntity type https://app.asana.com/0/0/1203099452204542/f */
      blockView.manager.replaceBlockChildEntity(
        blockEntityId,
        targetEntity as unknown as EntityStoreType,
      );
    },
    [blockView, blockEntityId],
  );

  const subgraph = useMemo(
    () =>
      queryResult
        ? mapGqlSubgraphFieldsFragmentToSubgraph<EntityRootType>(
            queryResult.queryEntities.subgraph,
          )
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
