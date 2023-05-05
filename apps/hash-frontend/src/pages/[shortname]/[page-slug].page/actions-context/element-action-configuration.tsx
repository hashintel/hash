import { TextField } from "@hashintel/design-system";
import { Box, Typography } from "@mui/material";
import { useState } from "react";

import { ActionsByTriggerName, ElementAction } from "../actions-context";

export const ElementActionsConfiguration = ({
  actions,
  updateActions,
}: {
  actions: ActionsByTriggerName;
  updateActions: (newActions: ActionsByTriggerName) => void;
}) => {
  const [selectedAction, setSelectedAction] = useState<
    ElementAction | undefined
  >(Object.values(actions)[0]);

  const [newAction, setNewAction] = useState<string>(
    selectedAction?.action?.toString() ?? "",
  );
  const [newLabel, setNewLabel] = useState<string>(
    selectedAction?.eventTrigger.label ?? "",
  );

  const updateAction = () => {
    if (!selectedAction) {
      return;
    }
    updateActions({
      ...actions,
      [selectedAction.eventTrigger.actionName]: {
        ...selectedAction,
        action: newAction ? eval(newAction) : undefined,
      },
    });
  };

  return (
    <Box>
      <Typography variant="h3">
        {selectedAction?.eventTrigger.actionName}
      </Typography>
      {selectedAction?.updateTriggerLabel && (
        <TextField
          label="Trigger label"
          value={newLabel}
          onBlur={() => selectedAction.updateTriggerLabel!(newLabel)}
          onChange={(event) => setNewLabel(event.target.value)}
          sx={{ mt: 4 }}
        />
      )}
      <TextField
        label={`Action to execute: (payload: ${JSON.stringify(
          selectedAction?.eventTrigger.payloadSchema,
        )}) => void`}
        multiline
        value={newAction}
        onBlur={updateAction}
        onChange={(event) => setNewAction(event.target.value)}
        sx={{ mt: 4 }}
      />
    </Box>
  );
};
