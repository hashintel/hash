import { PencilSimpleLine } from "../../../shared/icons/svg";
import {
  EditBarCollapse,
  EditBarContainer,
  EditBarContents,
  useFreezeScrollWhileTransitioning,
} from "../../shared/shared/edit-bar-contents";
import { useEditorContext } from "./editor-context";

export const ProcessEditBar = () => {
  const ref = useFreezeScrollWhileTransitioning();

  const {
    discardChanges,
    entityId,
    isDirty,
    persistPending,
    persistToGraph,
    userEditable,
  } = useEditorContext();

  return (
    <EditBarCollapse in={isDirty && !persistPending} ref={ref}>
      <EditBarContainer hasErrors={false}>
        <EditBarContents
          hideConfirm={false}
          hideDiscard={!discardChanges}
          icon={<PencilSimpleLine />}
          title={entityId ? "Currently editing – " : "New process –"}
          label={
            userEditable
              ? "changes not yet saved to your web"
              : "you can't edit the original, but can create a copy"
          }
          discardButtonProps={{
            children: "Discard changes",
            onClick: discardChanges ?? undefined,
          }}
          confirmButtonProps={{
            children: entityId ? "Update" : "Create",
            onClick: persistToGraph,
          }}
        />
      </EditBarContainer>
    </EditBarCollapse>
  );
};
