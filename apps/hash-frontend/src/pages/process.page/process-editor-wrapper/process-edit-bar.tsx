import type { EntityId } from "@blockprotocol/type-system";

import { PencilSimpleLine } from "../../../shared/icons/svg";
import {
  EditBarCollapse,
  EditBarContainer,
  EditBarContents,
  useFreezeScrollWhileTransitioning,
} from "../../shared/shared/edit-bar-contents";

export const ProcessEditBar = ({
  discardChanges,
  isDirty,
  persistToGraph,
  persistPending,
  userEditable,
  selectedNetId,
}: {
  discardChanges: (() => void) | null;
  isDirty: boolean;
  persistToGraph: () => void;
  persistPending: boolean;
  userEditable: boolean;
  selectedNetId: EntityId | null;
}) => {
  const ref = useFreezeScrollWhileTransitioning();

  return (
    <EditBarCollapse in={isDirty && !persistPending} ref={ref}>
      <EditBarContainer hasErrors={false}>
        <EditBarContents
          hideConfirm={false}
          hideDiscard={!discardChanges}
          icon={<PencilSimpleLine />}
          title={selectedNetId ? "Currently editing – " : "New process –"}
          label={
            userEditable
              ? "changes not yet saved to your web"
              : "you can't edit the original, but can create a copy"
          }
          discardButtonProps={{
            children: "Discard changes",
            onClick: isDirty && discardChanges ? discardChanges : undefined,
          }}
          confirmButtonProps={{
            children: selectedNetId ? "Update" : "Create",
            onClick: persistToGraph,
          }}
        />
      </EditBarContainer>
    </EditBarCollapse>
  );
};
