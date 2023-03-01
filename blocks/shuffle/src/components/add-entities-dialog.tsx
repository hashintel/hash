import { Entity, EntityType, GraphBlockHandler } from "@blockprotocol/graph";
import { getEntities } from "@blockprotocol/graph/stdlib";
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

import { propertyIds } from "../property-ids";
import { ListItem } from "../types";

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
  onAddEntityItems: (items: ListItem[]) => void;
  graphModule?: GraphBlockHandler | null;
  open: boolean;
  onClose: () => void;
}

export const AddEntitiesDialog = ({
  entityTypes,
  blockEntityId,
  onAddEntityItems,
  graphModule,
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
    if (!graphModule) return;

    const entityTypeId = entityType.$id;

    // get the entities of clicked entity type
    const { data } = await graphModule.aggregateEntities({
      data: {
        operation: {
          multiFilter: {
            operator: "AND",
            filters: [
              {
                field: ["metadata", "entityTypeId"],
                value: entityTypeId,
                operator: "EQUALS",
              },
            ],
          },
        },
      },
    });

    if (!data) return onClose();

    //
    const entities = getEntities(data.results);
    // // by default, all entity checkboxes are checked
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
    if (!graphModule) return;

    // create links for selected entities
    const selectedEntityIds: string[] = [];
    for (const [index, value] of Array.from(selections.entries())) {
      if (!value) continue;

      const entity = entityList[index];
      if (entity) selectedEntityIds.push(entity.metadata.recordId.entityId);
    }

    const createLinkResponses = await Promise.all(
      selectedEntityIds.map((entityId) =>
        graphModule.createEntity({
          data: {
            linkData: {
              leftEntityId: blockEntityId,
              rightEntityId: entityId,
            },
            properties: {},
            entityTypeId: propertyIds.itemContent,
          },
        }),
      ),
    );

    // add the new items to the shuffle items list
    // @todo check this
    onAddEntityItems(
      selectedEntityIds.map((_, i) => {
        return {
          [propertyIds.id]: uuid(),
          [propertyIds.value]: "",
          // @todo check this
          [propertyIds.linkEntityId]:
            createLinkResponses[i]?.data?.metadata.recordId.entityId,
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
            key={entityType.$id}
            onClick={() => handleEntityTypeClick(entityType)}
          >
            {entityType.title}
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
              const { entityId } = entity.metadata.recordId;
              // @todo generate this
              const label = "label";

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
