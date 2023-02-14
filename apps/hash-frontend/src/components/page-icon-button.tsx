import { fontAwesomeIconClasses, IconButton } from "@hashintel/design-system";
import { EntityId } from "@local/hash-subgraph/main";
import { iconButtonClasses, SxProps, Theme, Tooltip } from "@mui/material";
import { SystemStyleObject } from "@mui/system";
import { bindTrigger, usePopupState } from "material-ui-popup-state/hooks";
import { MouseEventHandler } from "react";

import {
  EmojiPicker,
  EmojiPickerPopoverProps,
} from "./emoji-picker/emoji-picker";
import { useUpdatePageIcon } from "./hooks/use-update-page-icon";
import { PageIcon, SizeVariant } from "./page-icon";

interface PageIconButtonProps {
  entityId: EntityId;
  readonly?: boolean;
  size?: SizeVariant;
  hasDarkBg?: boolean;
  onClick?: MouseEventHandler<HTMLButtonElement>;
  popoverProps?: EmojiPickerPopoverProps;
  sx?: SxProps<Theme>;
}

export const PageIconButton = ({
  entityId,
  readonly = false,
  size = "medium",
  hasDarkBg,
  onClick,
  popoverProps,
  sx = [],
}: PageIconButtonProps) => {
  const popupState = usePopupState({
    variant: "popover",
    popupId: "emoji-picker",
  });

  const [updatePageIcon, { updatePageIconLoading }] = useUpdatePageIcon();

  const trigger = bindTrigger(popupState);

  return (
    <>
      <Tooltip title="Change icon" placement="bottom">
        <IconButton
          {...trigger}
          onClick={(event) => {
            onClick?.(event);
            trigger.onClick(event);
          }}
          sx={[
            ({ palette }) => {
              const background = hasDarkBg
                ? palette.gray[40]
                : palette.gray[30];

              const hoverState: SystemStyleObject = {
                background,
                ...(hasDarkBg && {
                  [`.${fontAwesomeIconClasses.icon}`]: {
                    color: palette.gray[50],
                  },
                }),
              };
              return {
                p: 0,
                ...(popupState.isOpen && hoverState),
                "&:focus-visible, &:hover": hoverState,
                [`&.${iconButtonClasses.disabled}`]: { color: "unset" },
              };
            },
            ...(Array.isArray(sx) ? sx : [sx]),
          ]}
          disabled={readonly || updatePageIconLoading}
        >
          <PageIcon entityId={entityId} size={size} />
        </IconButton>
      </Tooltip>
      <EmojiPicker
        popoverProps={popoverProps}
        popupState={popupState}
        onEmojiSelect={(emoji) => {
          void updatePageIcon(emoji.native, entityId);
        }}
      />
    </>
  );
};
