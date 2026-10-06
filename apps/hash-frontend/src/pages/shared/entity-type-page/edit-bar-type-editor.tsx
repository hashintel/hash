import { faSmile } from "@fortawesome/free-regular-svg-icons";
import { useState } from "react";

import {
  incrementOntologyTypeVersion,
  type OntologyTypeVersion,
} from "@blockprotocol/type-system";
import { FontAwesomeIcon } from "@hashintel/design-system";
import { useEntityTypeFormState } from "@hashintel/type-editor";

import { PencilSimpleLine } from "../../../shared/icons/svg";
import {
  EditBarCollapse,
  EditBarContainer,
  EditBarContents,
  useFreezeScrollWhileTransitioning,
} from "../shared/edit-bar-contents";

import type { ButtonProps } from "../../../shared/ui/button";
import type { EntityTypeEditorFormData } from "@hashintel/type-editor";

const useFrozenValue = <T extends string | number | boolean | object>(
  value: T,
): T => {
  const { dirtyFields } = useEntityTypeFormState<EntityTypeEditorFormData>();

  const [frozen, setFrozen] = useState(value);

  if (Object.keys(dirtyFields).length > 0 && frozen !== value) {
    setFrozen(value);
  }

  return frozen;
};

export const EditBarTypeEditor = ({
  gentleErrorStyling,
  currentVersion,
  isDraft,
  discardButtonProps,
  errorMessage,
}: {
  gentleErrorStyling: boolean;
  currentVersion: OntologyTypeVersion;
  isDraft: boolean;
  discardButtonProps: Partial<ButtonProps>;
  errorMessage?: string;
}) => {
  const { dirtyFields, isSubmitting } =
    useEntityTypeFormState<EntityTypeEditorFormData>();
  const frozenVersion = useFrozenValue(currentVersion);
  const frozenIsDraft = useFrozenValue(isDraft);
  const ref = useFreezeScrollWhileTransitioning();

  const collapseIn = isDraft || Object.keys(dirtyFields).length > 0;

  const frozenDiscardButtonProps = useFrozenValue(discardButtonProps);

  const frozenSubmitting = useFrozenValue(isSubmitting);
  const isVersionExhausted =
    !frozenIsDraft &&
    Number.parseInt(frozenVersion.toString(), 10) === 4_294_967_295;

  let label;
  if (errorMessage) {
    label = `before saving${errorMessage ? `: ${errorMessage}` : ""}`;
  } else if (frozenIsDraft) {
    label = "– this type has not yet been created";
  } else if (isVersionExhausted) {
    label = "– this type has reached the maximum version and cannot be updated";
  } else {
    label = `Version ${frozenVersion.toString()} -> ${incrementOntologyTypeVersion(frozenVersion).toString()}`;
  }

  return (
    <EditBarCollapse in={collapseIn} ref={ref}>
      <EditBarContainer
        hasErrors={!!errorMessage}
        gentleErrorStyling={gentleErrorStyling}
      >
        <EditBarContents
          hideConfirm={!!errorMessage}
          icon={
            frozenIsDraft ? (
              <FontAwesomeIcon icon={faSmile} sx={{ fontSize: 14 }} />
            ) : (
              <PencilSimpleLine />
            )
          }
          title={errorMessage ? "Changes required" : "Currently editing"}
          label={label}
          discardButtonProps={{
            children: frozenIsDraft ? "Discard this type" : "Discard changes",
            disabled: frozenSubmitting,
            sx: errorMessage
              ? ({ palette }) => ({
                  borderColor: gentleErrorStyling
                    ? palette.gray[30]
                    : palette.common.white,
                  color: gentleErrorStyling ? palette.gray[50] : undefined,
                  "&:hover": {
                    backgroundColor: gentleErrorStyling
                      ? palette.gray[50]
                      : palette.red[50],
                  },
                })
              : undefined,
            ...frozenDiscardButtonProps,
          }}
          confirmButtonProps={{
            children: frozenIsDraft ? "Create" : "Publish update",
            loading: frozenSubmitting,
            disabled: frozenSubmitting || isVersionExhausted,
          }}
        />
      </EditBarContainer>
    </EditBarCollapse>
  );
};
