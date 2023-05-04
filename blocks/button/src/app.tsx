import { ActionDefinition } from "@blockprotocol/action";
import { useActionBlockModule } from "@blockprotocol/action/react";
import { useRef, useState } from "react";
import { v4 as uuid } from "uuid";

import styles from "./base.module.scss";

export const App = () => {
  const blockRootRef = useRef<HTMLDivElement>(null);

  const [availableActions, setAvailableActions] = useState<ActionDefinition[]>([
    {
      elementId: `button-${uuid()}}`,
      actionName: "Click Button",
      label: "Submit",
      payloadSchema: { type: "null" },
    },
  ]);

  const { actionModule } = useActionBlockModule(blockRootRef, {
    callbacks: {
      // eslint-disable-next-line @typescript-eslint/require-await
      updateAction: async ({ data }) => {
        if (!data) {
          return { errors: [{ code: "INVALID_INPUT", message: "No data" }] };
        }
        const foundAction = availableActions.find(
          (action) =>
            action.elementId === data.elementId &&
            action.actionName === data.actionName,
        );

        if (!foundAction) {
          return {
            errors: [
              {
                code: "NOT_FOUND",
                message: "Action not found",
              },
            ],
          };
        }

        const newActions = availableActions.map((action) =>
          action.elementId === data.elementId &&
          action.actionName === data.actionName
            ? { ...action, label: data.label }
            : action,
        );

        setAvailableActions(newActions);

        return {
          data: { actions: newActions },
        };
      },
    },
  });

  const buttonAction = availableActions[0]!;

  return (
    <div className={styles.block} ref={blockRootRef}>
      <button
        className={styles.button}
        onClick={() =>
          actionModule.action({
            data: {
              actionName: buttonAction.actionName,
              elementId: buttonAction.elementId,
              payload: null,
            },
          })
        }
        type="button"
      >
        {buttonAction.label}
      </button>
    </div>
  );
};
