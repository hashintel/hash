import {
  incrementOntologyTypeVersion,
  makeOntologyTypeVersion,
  type OntologyTypeVersion,
} from "@blockprotocol/type-system";
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
} from "../shared/edit-bar-contents";

const useFrozenValue = <T extends number | boolean | object>(value: T): T => {
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
  discardButtonProps,
  errorMessage,
}: {
  gentleErrorStyling: boolean;
  currentVersion: OntologyTypeVersion;
  discardButtonProps: Partial<ButtonProps>;
  errorMessage?: string;
}) => {
  const { dirtyFields, isSubmitting } =
    useEntityTypeFormState<EntityTypeEditorFormData>();
  const frozenVersion = useFrozenValue(currentVersion);
  const ref = useFreezeScrollWhileTransitioning();
  const zeroVersion = makeOntologyTypeVersion({ major: 0 });

  const collapseIn =
    currentVersion === zeroVersion || Object.keys(dirtyFields).length > 0;

  const frozenDiscardButtonProps = useFrozenValue(discardButtonProps);

  const frozenSubmitting = useFrozenValue(isSubmitting);

  let label;
  if (errorMessage) {
    label = `before saving${errorMessage ? `: ${errorMessage}` : ""}`;
  } else if (frozenVersion === zeroVersion) {
    label = "– this type has not yet been created";
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
            frozenVersion === zeroVersion ? (
              <FontAwesomeIcon icon={faSmile} sx={{ fontSize: 14 }} />
            ) : (
              <PencilSimpleLine />
            )
          }
          title={errorMessage ? "Changes required" : "Currently editing"}
          label={label}
          discardButtonProps={{
            children:
              frozenVersion === zeroVersion
                ? "Discard this type"
                : "Discard changes",
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
            children:
              frozenVersion === zeroVersion ? "Create" : "Publish update",
            loading: frozenSubmitting,
            disabled: frozenSubmitting,
          }}
        />
      </EditBarContainer>
    </EditBarCollapse>
  );
};
