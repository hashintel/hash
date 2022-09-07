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
} from "@mui/material";
import { Button } from "@hashintel/hash-design-system";
import {
  useImperativeHandle,
  forwardRef,
  ForwardRefRenderFunction,
  useState,
  ChangeEvent,
} from "react";
import { v4 as uuid } from "uuid";
import { Items } from "../shuffle";
import { getEntityLabel } from "../utils";

export interface AddEntitiesDialogRef {
  show: () => void;
}

interface AddEntitiesDialogProps {
  entityTypes: EntityType[];
  graphService?: GraphBlockHandler | null;
  blockEntityId: string;
  onAddItems: (items: Items) => void;
}

type DialogState = "closed" | "entityType" | "entityList";

const _AddEntitiesDialog: ForwardRefRenderFunction<
  AddEntitiesDialogRef,
  AddEntitiesDialogProps
> = ({ entityTypes, graphService, blockEntityId, onAddItems }, ref) => {
  const [dialogState, setDialogState] = useState<DialogState>("closed");
  const [entityList, setEntityList] = useState<Entity[]>([]);

  const [selections, setSelections] = useState<Record<string, boolean>>({});

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    setSelections((prev) => ({
      ...prev,
      [event.target.name]: event.target.checked,
    }));
  };

  const handleClose = () => setDialogState("closed");

  useImperativeHandle(
    ref,
    () => ({
      show: () => {
        setDialogState("entityType");
        setEntityList([]);
      },
    }),
    [],
  );

  const selectedItemCount = Object.entries(selections).filter(
    ([_, isSelected]) => isSelected,
  ).length;
  const hasSelectedItems = Boolean(selectedItemCount);

  return (
    <Dialog
      open={dialogState !== "closed"}
      onClose={handleClose}
      fullWidth
      maxWidth="xs"
    >
      <DialogTitle>
        {dialogState === "entityType"
          ? "Choose Entity Type"
          : "Select Entities"}
      </DialogTitle>

      {dialogState === "entityType" &&
        entityTypes.map(({ entityTypeId, schema }) => (
          <Button
            key={entityTypeId}
            onClick={async () => {
              const res = await graphService?.aggregateEntities({
                data: { operation: { entityTypeId, itemsPerPage: 100 } },
              });

              const entities = res?.data?.results;

              if (!entities) return setDialogState("closed");

              const allSelected = entities.reduce((prev, curr) => {
                return { ...prev, [curr.entityId]: true };
              }, {});

              setSelections(allSelected);
              setEntityList(entities);
              setDialogState("entityList");
            }}
          >
            {schema.title}
          </Button>
        ))}

      {dialogState === "entityList" && (
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
                <FormControlLabel
                  key={entityId}
                  label={label}
                  sx={{
                    width: "100%",

                    [`.${formControlLabelClasses.label}`]: {
                      overflow: "hidden",
                      whiteSpace: "nowrap",
                      textOverflow: "ellipsis",
                    },
                  }}
                  control={
                    <Checkbox
                      checked={selections[entityId]}
                      onChange={handleChange}
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
        {dialogState === "entityList" && (
          <Button
            disabled={!hasSelectedItems}
            onClick={async () => {
              if (!graphService) return;

              // create links for selected items
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

              const createLinkRes = await Promise.all(createLinkPromises);

              // add the new items
              onAddItems(
                selectedEntityIds.map((entityId, i) => {
                  return {
                    id: uuid(),
                    entityId,
                    linkId: createLinkRes[i]?.data?.linkId,
                    value: "",
                  };
                }),
              );

              // close the modal
              handleClose();
            }}
          >
            {hasSelectedItems ? `Add (${selectedItemCount})` : "Add"}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
};

export const AddEntitiesDialog = forwardRef(_AddEntitiesDialog);
