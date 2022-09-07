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
import {
  useImperativeHandle,
  forwardRef,
  ForwardRefRenderFunction,
  useState,
  ChangeEvent,
  useMemo,
} from "react";
import { v4 as uuid } from "uuid";
import { Items } from "../shuffle";
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
  onAddEntityItems: (items: Items) => void;
  graphService?: GraphBlockHandler | null;
}

type DialogState = "closed" | "entityTypes" | "entities";

const _AddEntitiesDialog: ForwardRefRenderFunction<
  AddEntitiesDialogRef,
  AddEntitiesDialogProps
> = ({ entityTypes, blockEntityId, onAddEntityItems, graphService }, ref) => {
  const [dialogState, setDialogState] = useState<DialogState>("closed");
  const [entityList, setEntityList] = useState<Entity[]>([]);
  const [selections, setSelections] = useState<Record<string, boolean>>({});

  useImperativeHandle(
    ref,
    () => ({
      show: () => {
        setDialogState("entityTypes");
        setEntityList([]);
      },
    }),
    [],
  );

  const handleEntityTypeClick = async (entityTypeId: string) => {
    if (!graphService) return;
    const { data } = await graphService.aggregateEntities({
      data: { operation: { entityTypeId, itemsPerPage: 100 } },
    });

    if (!data) return setDialogState("closed");

    const { results: entities } = data;

    const initialEntitySelection = entities.reduce(
      (prev, curr) => ({ ...prev, [curr.entityId]: true }),
      {},
    );

    setEntityList(entities);
    setSelections(initialEntitySelection);
    setDialogState("entities");
  };

  const handleCheckboxChange = (event: ChangeEvent<HTMLInputElement>) => {
    setSelections((prev) => ({
      ...prev,
      [event.target.name]: event.target.checked,
    }));
  };

  const handleClose = () => setDialogState("closed");

  const handleAddClick = async () => {
    if (!graphService) return;

    // create links for selected entities
    const selectedEntityIds = Object.entries(selections)
      .filter(([_, isSelected]) => isSelected)
      .map(([id]) => id);

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

    // add the new items
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

  const selectedItemCount = useMemo(() => {
    const entries = Object.entries(selections);
    const selectedEntries = entries.filter(([_, isSelected]) => isSelected);
    return selectedEntries.length;
  }, [selections]);

  return (
    <Dialog
      open={dialogState !== "closed"}
      onClose={handleClose}
      fullWidth
      maxWidth="xs"
    >
      <DialogTitle>
        {dialogState === "entityTypes"
          ? "Choose Entity Type"
          : "Select Entities"}
      </DialogTitle>

      {dialogState === "entityTypes" &&
        entityTypes.map(({ entityTypeId, schema }) => (
          <Button
            key={entityTypeId}
            onClick={() => handleEntityTypeClick(entityTypeId)}
          >
            {schema.title}
          </Button>
        ))}

      {dialogState === "entities" && (
        <FormControl
          sx={{ mx: 3, mb: 3 }}
          component="fieldset"
          variant="standard"
        >
          <FormGroup>
            {entityList.map((entity) => {
              const { entityId, entityTypeId } = entity;
              const entityType = entityTypes.find(
                (type) => type.entityTypeId === entityTypeId,
              );
              const label = getEntityLabel(entity, entityType);

              return (
                <SFormControlLabel
                  key={entityId}
                  label={label}
                  control={
                    <Checkbox
                      checked={selections[entityId]}
                      onChange={handleCheckboxChange}
                      name={entityId}
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
        {dialogState === "entities" && (
          <Button disabled={!selectedItemCount} onClick={handleAddClick}>
            {selectedItemCount ? `Add (${selectedItemCount})` : "Add"}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
};

export const AddEntitiesDialog = forwardRef(_AddEntitiesDialog);
