import { Banner } from "@hashintel/ds-components";
import { generateFlowTriggersPath } from "@local/hash-isomorphic-utils/flows/frontend-paths";

import type { FlowSaveRefusedError } from "./use-autosaved-flow-editor";
import type { EntityId } from "@blockprotocol/type-system";

/** Why the latest edits weren't saved: the API refused them, or the flow changed elsewhere. */
export const SaveBanners = ({
  flowDefinitionEntityId,
  saveRefusal,
  onSaveAgain,
  changedElsewhere,
  onDismissChangedElsewhere,
}: {
  flowDefinitionEntityId: EntityId;
  saveRefusal: FlowSaveRefusedError | null;
  /** E.g. once the schedules that stopped the edits are paused or deleted. */
  onSaveAgain: () => void;
  changedElsewhere: boolean;
  onDismissChangedElsewhere: () => void;
}) => (
  <>
    {saveRefusal !== null && (
      <Banner tone="error">
        <Banner.Title>Your latest edits can't be saved</Banner.Title>
        <Banner.Description as="div">
          {saveRefusal.message.split("\n").map((line) => (
            <div key={line}>{line}</div>
          ))}
        </Banner.Description>
        {saveRefusal.blockedBySchedules && (
          <Banner.Actions>
            {/* In a new tab, so the refused edits stay here to save again. */}
            <Banner.ActionButton
              href={generateFlowTriggersPath({ flowDefinitionEntityId })}
              target="_blank"
              iconName="externalLink"
              iconPosition="right"
            >
              Edit flow triggers
            </Banner.ActionButton>
            <Banner.ActionButton onClick={onSaveAgain}>
              Save again
            </Banner.ActionButton>
          </Banner.Actions>
        )}
      </Banner>
    )}
    {changedElsewhere && (
      <Banner
        tone="warning"
        dismissible={{ onDismiss: onDismissChangedElsewhere }}
      >
        <Banner.Title>This flow changed elsewhere</Banner.Title>
        <Banner.Description>
          It was saved from somewhere else, so it now shows the latest version.
          Your latest edits weren't saved.
        </Banner.Description>
      </Banner>
    )}
  </>
);
