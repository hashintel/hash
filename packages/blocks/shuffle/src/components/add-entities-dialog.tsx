import { Entity, EntityType, GraphBlockHandler } from "@blockprotocol/graph/.";
import {
  Dialog,
  DialogTitle,
  DialogActions,
  FormControl,
  FormGroup,
  FormControlLabel,
  Checkbox,
  formControlLabelClasses,
  experimental_sx as sx,
  styled,
} from "@mui/material";
import { Button } from "@hashintel/hash-design-system";
import { useImperativeHandle, forwardRef, useState } from "react";
import { v4 as uuid } from "uuid";
import { Item } from "../shuffle";
import { getEntityLabel } from "../utils";

const SFormControlLabel = styled(FormControlLabel)(
  sx({
    width: "100%",

    [`.${formControlLabelClasses.label}`]: {
      overflow: "hidden",
      whiteSpace: "nowrap",
      textOverflow: "ellipsis",
    },
  }),
);

export interface AddEntitiesDialogRef {
  show: () => void;
}

interface AddEntitiesDialogProps {
  entityTypes: EntityType[];
  blockEntityId: string;
  onAddEntityItems: (items: Item[]) => void;
  graphService?: GraphBlockHandler | null;
}

export const AddEntitiesDialog = forwardRef<
  AddEntitiesDialogRef,
  AddEntitiesDialogProps
>(({ entityTypes, blockEntityId, onAddEntityItems, graphService }, ref) => {
  const [open, setOpen] = useState(false);
  const [selectedEntityType, setSelectedEntityType] = useState<EntityType>();
  const [entityList, setEntityList] = useState<Entity[]>([]);
  // `selections` is a object that stores checkbox `checked` state for each entity.
  const [selections, setSelections] = useState<boolean[]>([]);

  const handleClose = () => setOpen(false);

  /**
   * Defined a custom ref, so the parent can simply call `dialogRef.show()`,
   * which also resets the state to it's initial value when modal is opened,
   * instead of using an `useEffect` that listens modal's state
   */
  useImperativeHandle(
    ref,
    () => ({
      show: () => {
        setOpen(true);
        setSelectedEntityType(undefined);
        setEntityList([]);
      },
    }),
    [],
  );

  const handleEntityTypeClick = async (entityType: EntityType) => {
    if (!graphService) return;

    const { entityTypeId } = entityType;

    // get the entities of clicked entity type
    const { data } = await graphService.aggregateEntities({
      data: { operation: { entityTypeId, itemsPerPage: 100 } },
    });

    if (!data) return handleClose();

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
    selections.forEach((value, index) => {
      if (!value) return;

      const entity = entityList[index];
      if (entity) selectedEntityIds.push(entity.entityId);
    });

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
    handleClose();
  };

  const selectedItemCount = selections.filter((value) => !!value).length;

  return (
    <Dialog open={open} onClose={handleClose} fullWidth maxWidth="xs">
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
        <Button variant="secondary" onClick={handleClose}>
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
});
