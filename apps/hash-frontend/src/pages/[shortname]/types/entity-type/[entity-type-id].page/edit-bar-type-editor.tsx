import { faSmile } from "@fortawesome/free-regular-svg-icons";
import { FontAwesomeIcon } from "@hashintel/design-system";
import { useState } from "react";
import { useFormState } from "react-hook-form";

import { PencilSimpleLine } from "../../../../../shared/icons/svg";
import { ButtonProps } from "../../../../../shared/ui/button";
import {
  EditBarCollapse,
  EditBarContainer,
  EditBarContents,
  useFreezeScrollWhileTransitioning,
} from "./shared/edit-bar";
import { EntityTypeEditorForm } from "./shared/form-types";

const useFrozenValue = <T extends any>(value: T): T => {
  const { isDirty } = useFormState<EntityTypeEditorForm>();

  const [frozen, setFrozen] = useState(value);

  if (isDirty && frozen !== value) {
    setFrozen(value);
  }

  return frozen;
};

export const EditBarTypeEditor = ({
  currentVersion,
  discardButtonProps,
}: {
  currentVersion: number;
  discardButtonProps: Partial<ButtonProps>;
}) => {
  const { isDirty } = useFormState<EntityTypeEditorForm>();
  const frozenVersion = useFrozenValue(currentVersion);
  const ref = useFreezeScrollWhileTransitioning();

  const collapseIn = currentVersion === 0 || isDirty;

  const frozenDiscardButtonProps = useFrozenValue(discardButtonProps);

  const { isSubmitting } = useFormState<EntityTypeEditorForm>();

  const frozenSubmitting = useFrozenValue(isSubmitting);

  return (
    <EditBarCollapse in={collapseIn} ref={ref}>
      <EditBarContainer>
        {frozenVersion === 0 ? (
          <EditBarContents
            icon={<FontAwesomeIcon icon={faSmile} sx={{ fontSize: 14 }} />}
            title="Currently editing"
            label="- this type has not yet been created"
            discardButtonProps={{
              children: "Discard this type",
              disabled: frozenSubmitting,
              ...frozenDiscardButtonProps,
            }}
            confirmButtonProps={{
              children: "Create",
              loading: frozenSubmitting,
              disabled: frozenSubmitting,
            }}
          />
        ) : (
          <EditBarContents
            icon={<PencilSimpleLine />}
            title="Currently editing"
            label={`Version ${frozenVersion} -> ${frozenVersion + 1}`}
            discardButtonProps={{
              children: "Discard changes",
              disabled: frozenSubmitting,
              ...frozenDiscardButtonProps,
            }}
            confirmButtonProps={{
              children: "Publish update",
              loading: frozenSubmitting,
              disabled: frozenSubmitting,
            }}
          />
        )}
      </EditBarContainer>
    </EditBarCollapse>
  );
};
