import { Entity, EntityType, GraphBlockHandler } from "@blockprotocol/graph/.";
import { Button } from "@hashintel/design-system";
import {
  Checkbox,
  Dialog,
  DialogActions,
  DialogTitle,
  FormControl,
  FormControlLabel,
  formControlLabelClasses,
  FormGroup,
  styled,
} from "@mui/material";
import { useState } from "react";
import { v4 as uuid } from "uuid";

import { Item } from "../shuffle";
import { getEntityLabel } from "../utils";

const SFormControlLabel = styled(FormControlLabel)(({ theme }) =>
  theme.unstable_sx({
    width: "100%",

    [`.${formControlLabelClasses.label}`]: {
      overflow: "hidden",
      whiteSpace: "nowrap",
      textOverflow: "ellipsis",
    },
  }),
);

interface AddEntitiesDialogProps {
  entityTypes: EntityType[];
  blockEntityId: string;
  onAddEntityItems: (items: Item[]) => void;
  graphService?: GraphBlockHandler | null;
  open: boolean;
  onClose: () => void;
}

export const AddEntitiesDialog = ({
  entityTypes,
  blockEntityId,
  onAddEntityItems,
  graphService,
  open,
  onClose,
}: AddEntitiesDialogProps) => {
  const [selectedEntityType, setSelectedEntityType] = useState<EntityType>();
  const [entityList, setEntityList] = useState<Entity[]>([]);
  // `selections` is a object that stores checkbox `checked` state for each entity.
  const [selections, setSelections] = useState<boolean[]>([]);

  const [prevOpen, setPrevOpen] = useState(open);
  if (prevOpen !== open) {
    setPrevOpen(open);
    // reset the state when modal is open
    if (open) {
      setSelectedEntityType(undefined);
      setEntityList([]);
    }
  }

  const handleEntityTypeClick = async (entityType: EntityType) => {
    if (!graphService) return;

    const { entityTypeId } = entityType;

    // get the entities of clicked entity type
    const { data } = await graphService.aggregateEntities({
      data: { operation: { entityTypeId, itemsPerPage: 100 } },
    });

    if (!data) return onClose();

    const { results: entities } = data;

    // by default, all entity checkboxes are checked
    const initialSelection = entities.map(() => true);

    setEntityList(entities);
    setSelections(initialSelection);
    setSelectedEntityType(entityType);
  };

  const handleCheckboxChange = (changedIndex: number) => {
    setSelections((prev) =>
      prev.map((value, index) => (index === changedIndex ? !value : value)),
    );
  };

  const handleAddClick = async () => {
    if (!graphService) return;

    // create links for selected entities
    const selectedEntityIds: string[] = [];
    for (const [index, value] of Array.from(selections.entries())) {
      if (!value) continue;

      const entity = entityList[index];
      if (entity) selectedEntityIds.push(entity.entityId);
    }

    const createLinkPromises = selectedEntityIds.map((entityId) =>
      graphService.createLink({
        data: {
          sourceEntityId: blockEntityId,
          destinationEntityId: entityId,
          path: "$.items",
        },
      }),
    );

    const createLinkResponses = await Promise.all(createLinkPromises);

    // add the new items to the shuffle items list
    onAddEntityItems(
      selectedEntityIds.map((entityId, i) => {
        return {
          id: uuid(),
          value: "",
          entityId,
          linkId: createLinkResponses[i]?.data?.linkId,
        };
      }),
    );

    // close the modal
    onClose();
  };

  const selectedItemCount = selections.filter((value) => !!value).length;

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>
        {selectedEntityType ? "Select Entities" : "Choose Entity Type"}
      </DialogTitle>

      {!selectedEntityType &&
        entityTypes.map((entityType) => (
          <Button
            key={entityType.entityTypeId}
            onClick={() => handleEntityTypeClick(entityType)}
          >
            {entityType.schema.title}
          </Button>
        ))}

      {selectedEntityType && (
        <FormControl
          sx={{ mx: 3, mb: 3 }}
          component="fieldset"
          variant="standard"
        >
          <FormGroup>
            {entityList.map((entity, i) => {
              const { entityId } = entity;
              const label = getEntityLabel(entity, selectedEntityType);

              return (
                <SFormControlLabel
                  key={entityId}
                  label={label}
                  control={
                    <Checkbox
                      checked={selections[i]}
                      onChange={() => handleCheckboxChange(i)}
                    />
                  }
                />
              );
            })}
          </FormGroup>
        </FormControl>
      )}

      <DialogActions>
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        {selectedEntityType && (
          <Button disabled={!selectedItemCount} onClick={handleAddClick}>
            {selectedItemCount ? `Add (${selectedItemCount})` : "Add"}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
};
