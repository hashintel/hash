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
  Typography,
} from "@mui/material";
import { useEffect, useRef, VFC } from "react";
import { useBlockView } from "../../blocks/page/BlockViewContext";
import { FontAwesomeIcon } from "../../shared/icons";
import { useRouteAccountInfo } from "../../shared/routing";
import { TextField } from "../../shared/ui";
import { useAccountEntities } from "../hooks/useAccountEntities";

type LoadEntityMenuContentProps = {
  entityId: string;
  entityStore: EntityStore;
};

export const LoadEntityMenuContent: VFC<LoadEntityMenuContentProps> = ({
  entityId,
  entityStore,
}) => {
  const { accountId } = useRouteAccountInfo();
  const { data: entities, fetchEntities } = useAccountEntities();
  const blockView = useBlockView();
  const blockData = entityId ? entityStore.saved[entityId] : null;

  const entityStoreRef = useRef(entityStore);

  useEffect(() => {
    entityStoreRef.current = entityStore;
  });

  const blockEntity = isBlockEntity(blockData)
    ? blockData.properties.entity
    : null;

  console.log(Object.keys(entityStore.draft));

  useEffect(() => {
    if (isBlockEntity(blockData) && accountId) {
      void fetchEntities(accountId, {
        componentId: blockData.properties.componentId,
      });
    }
  }, [blockData, accountId, fetchEntities]);

  const handleClick = (id: string) => {
    const targetData = entities.find((item) => item.entityId === id)!;
    const targetEntity = isBlockEntity(targetData)
      ? targetData.properties.entity
      : null;

    if (!blockEntity) return;

    debugger;
    if (targetEntity.entityId === blockEntity.entityId) return;

    const currentEntityStore = entityStoreRef.current;
    const tr = blockView.view.state.tr;

    // check if entity exists in draft
    const draftEntity = Object.values(currentEntityStore.draft).find(
      (entity) => entity.entityId === targetEntity?.entityId,
    );

    console.log("draftEntity ==> ", draftEntity);

    if (!draftEntity) {
      const draftId = newDraftId();
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

      const updatedStore = entityStorePluginStateFromTransaction(
        tr,
        blockView.view.state,
      );
      console.log("updatedStore ==> ", updatedStore.store);
      console.log(Object.keys(updatedStore.store.draft));

      // blockView.manager
      //   .createRemoteBlock(
      //     blockData?.properties.componentId!,
      //     updatedStore.store,
      //     `draft-${blockEntity.entityId}`,
      //   )
      //   .then(() => {})
      //   .catch(() => {});
      // 3. If it is not, put it in the entity store
    }

    //  4. Update the block entity in the entity store to point to this entity

    addEntityStoreAction(blockView.view.state, tr, {
      type: "updateEntityProperties",
      payload: {
        draftId: `draft-${blockEntity.entityId}`,
        merge: false,
        properties: targetEntity.properties,
      },
    });

    /**
     * 5. Update the prosemirror tree to reflect this
     */
    blockView.view.dispatch(tr);
  };

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
