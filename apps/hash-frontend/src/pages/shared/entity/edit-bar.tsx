import type { ReactNode } from "react";

import { PencilSimpleLine } from "../../../shared/icons/svg";
import { WarnIcon } from "../../../shared/icons/warn-icon";
import type { ButtonProps } from "../../../shared/ui/button";
import {
  EditBarCollapse,
  EditBarContainer,
  EditBarContents,
  useFreezeScrollWhileTransitioning,
} from "../shared/edit-bar-contents";

export const EditBarEntityEditor = ({
  confirmButtonProps,
  discardButtonProps,
  errorMessage,
  hasErrors,
  label,
  visible,
}: {
  confirmButtonProps: Partial<ButtonProps>;
  discardButtonProps: Partial<ButtonProps>;
  hasErrors: boolean;
  errorMessage?: string;
  label?: ReactNode;
  visible: boolean;
}) => {
  const ref = useFreezeScrollWhileTransitioning();

  return (
    <EditBarCollapse in={visible} ref={ref}>
      <EditBarContainer hasErrors={hasErrors}>
        <EditBarContents
          hideConfirm={hasErrors}
          icon={hasErrors ? <WarnIcon /> : <PencilSimpleLine />}
          title={hasErrors ? "Changes required" : "Currently editing"}
          label={
            hasErrors
              ? `before saving${errorMessage ? `: ${errorMessage}` : ""}`
              : label
          }
          discardButtonProps={{
            children: "Discard changes",
            ...discardButtonProps,
            sx: hasErrors
              ? {
                  borderColor: "white",
                  "&:hover": {
                    backgroundColor: ({ palette }) => palette.red[50],
                  },
                }
              : undefined,
          }}
          confirmButtonProps={{
            children: "Publish update",
            ...confirmButtonProps,
          }}
        />
      </EditBarContainer>
    </EditBarCollapse>
  );
};
