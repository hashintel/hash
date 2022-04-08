import { faAsterisk, faSearch } from "@fortawesome/free-solid-svg-icons";
import { EntityStore, isBlockEntity } from "@hashintel/hash-shared/entityStore";
import {
  addEntityStoreAction,
  entityStorePluginStateFromTransaction,
  newDraftId,
} from "@hashintel/hash-shared/entityStorePlugin";
import {
  Box,
  InputAdornment,
  ListItemIcon,
  ListItemText,
  MenuItem,
  MenuList,
} from "@mui/material";
import { useCallback, useEffect, VFC } from "react";
import { useBlockView } from "../../blocks/page/BlockViewContext";
import { FontAwesomeIcon } from "../../shared/icons";
import { useRouteAccountInfo } from "../../shared/routing";
import { LoadingSpinner, TextField } from "../../shared/ui";
import { useAccountEntities } from "../hooks/useAccountEntities";

type LoadEntityMenuContentProps = {
  entityId: string | null;
  entityStore: EntityStore;
};

export const LoadEntityMenuContent: VFC<LoadEntityMenuContentProps> = ({
  entityId,
  // entityStore,
}) => {
  const { accountId } = useRouteAccountInfo();
  const { data: entities, fetchEntities, loading } = useAccountEntities();
  const blockView = useBlockView();
  const entityStore = entityStorePluginStateFromTransaction(
    blockView.view.state.tr,
    blockView.view.state,
  ).store;
  // console.log("entityId --> ", entityId);
  const blockData = entityId ? entityStore.saved[entityId] : null;

  console.log("block Data ==> ", blockData);

  const blockEntity = isBlockEntity(blockData)
    ? blockData.properties.entity
    : null;

  useEffect(() => {
    if (isBlockEntity(blockData) && accountId) {
      void fetchEntities(accountId, {
        componentId: blockData.properties.componentId,
      });
    }
  }, [blockData, accountId, fetchEntities]);

  const handleClick = useCallback(
    (id: string) => {
      const targetData = entities.find((item) => item.entityId === id)!;
      const targetEntity = isBlockEntity(targetData)
        ? targetData.properties.entity
        : null;

      if (
        !targetEntity ||
        !blockEntity ||
        targetEntity.entityId === blockEntity.entityId
      ) {
        return;
      }

      const tr = blockView.view.state.tr;
      let currentEntityStore = entityStorePluginStateFromTransaction(
        tr,
        blockView.view.state,
      ).store;

      // check if entity exists in draft
      let draftEntity = Object.values(currentEntityStore.draft).find(
        (entity) => entity.entityId === targetEntity?.entityId,
      );

      let draftId = "";

      // 3. If it is not, put it in the entity store
      if (!draftEntity) {
        draftId = newDraftId();
        addEntityStoreAction(blockView.view.state, tr, {
          type: "newDraftEntity",
          payload: {
            accountId: targetEntity.accountId,
            draftId,
            entityId: targetEntity.entityId,
          },
        });
        addEntityStoreAction(blockView.view.state, tr, {
          type: "updateEntityProperties",
          payload: {
            draftId,
            merge: false,
            properties: targetEntity.properties,
          },
        });

        blockView.view.dispatch(tr);
      } else {
        draftId = draftEntity.draftId;
      }

      currentEntityStore = entityStorePluginStateFromTransaction(
        tr,
        blockView.view.state,
      ).store;

      draftEntity = currentEntityStore.draft[draftId];

      //  4. Update the block entity in the entity store to point to this entity
      addEntityStoreAction(blockView.view.state, tr, {
        type: "updateEntityProperties",
        payload: {
          draftId: `draft-${blockData!.entityId}`,
          merge: false,
          properties: {
            componentId: blockData?.properties.componentId,
            entity: draftEntity!,
            __typename: "BlockProperties",
          },
        },
      });

      currentEntityStore = entityStorePluginStateFromTransaction(
        tr,
        blockView.view.state,
      ).store;

      // console.log("updated store ==> ", currentEntityStore);

      // console.log(
      //   "updated block ==> ",
      //   currentEntityStore.draft[`draft-${blockData?.entityId}`],
      // );

      const pos = blockView.getPos();
      /**
       * 5. Update the prosemirror tree to reflect this
       * For now just insert the new block,
       * can handle replacing once this works
       */
      // blockView.manager
      //   .createRemoteBlock(
      //     blockData?.properties.componentId!,
      //     currentEntityStore,
      //     `draft-${blockData.entityId}`,
      //   )
      //   .then((node) => {
      //     tr.replaceRangeWith(pos, pos + node.nodeSize, node);
      //     blockView.view.dispatch(tr);
      //   })
      //   .catch((error) => {
      //     console.log(error);
      //   });

      const node = blockView.manager.createLocalBlock(
        blockData?.properties.componentId!,
        currentEntityStore,
        `draft-${blockData!.entityId}`,
      );

      tr.replaceRangeWith(pos, pos + node.nodeSize, node);
      blockView.view.dispatch(tr);

      // blockView.view.dispatch(tr);
    },
    [blockView, blockData, entities],
  );

  return (
    <MenuList>
      <Box sx={{ mx: 0.75 }}>
        <TextField
          placeholder="Search for entities"
          fullWidth
          size="xs"
          onChange={(evt) => {
            evt.stopPropagation();
          }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <FontAwesomeIcon icon={faSearch} />
              </InputAdornment>
            ),
            endAdornment: loading ? (
              <InputAdornment
                position="start"
                sx={{ visibility: loading ? "visible" : "hidden" }}
              >
                <LoadingSpinner size={12} thickness={4} />
              </InputAdornment>
            ) : null,
          }}
        />
      </Box>
      {entities.map((entity) => {
        return (
          <MenuItem
            key={entity.entityId}
            onClick={() => handleClick(entity.entityId)}
          >
            <ListItemIcon>
              <FontAwesomeIcon icon={faAsterisk} />
            </ListItemIcon>
            <ListItemText
              primary={entity.properties.entity.entityId}
              primaryTypographyProps={{
                noWrap: true,
              }}
            />
          </MenuItem>
        );
      })}
    </MenuList>
  );
};
