import { faSmile } from "@fortawesome/free-regular-svg-icons";
import { FontAwesomeIcon } from "@hashintel/design-system";
import type { EntityTypeEditorFormData } from "@hashintel/type-editor";
import { useEntityTypeFormState } from "@hashintel/type-editor";
import { useState } from "react";

import { PencilSimpleLine } from "../../../shared/icons/svg";
import type { ButtonProps } from "../../../shared/ui/button";
import {
  EditBarCollapse,
  EditBarContainer,
  EditBarContents,
  useFreezeScrollWhileTransitioning,
} from "../../@/[shortname]/shared/edit-bar";

const useFrozenValue = <T extends number | boolean | object>(value: T): T => {
  const { dirtyFields } = useEntityTypeFormState<EntityTypeEditorFormData>();

  const [frozen, setFrozen] = useState(value);

  if (Object.keys(dirtyFields).length > 0 && frozen !== value) {
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
  const { dirtyFields, isSubmitting } =
    useEntityTypeFormState<EntityTypeEditorFormData>();
  const frozenVersion = useFrozenValue(currentVersion);
  const ref = useFreezeScrollWhileTransitioning();

  const collapseIn =
    currentVersion === 0 || Object.keys(dirtyFields).length > 0;

  const frozenDiscardButtonProps = useFrozenValue(discardButtonProps);

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
