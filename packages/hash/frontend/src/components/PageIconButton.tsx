import {
  fontAwesomeIconClasses,
  IconButton,
} from "@hashintel/hash-design-system";
import { iconButtonClasses, Tooltip, SxProps, Theme } from "@mui/material";
import { SystemStyleObject } from "@mui/system";
import { bindTrigger, usePopupState } from "material-ui-popup-state/hooks";
import { MouseEventHandler } from "react";

import {
  EmojiPicker,
  EmojiPickerPopoverProps,
} from "./EmojiPicker/EmojiPicker";
import { useUpdatePageIcon } from "./hooks/useUpdatePageIcon";
import { PageIcon, SizeVariant } from "./PageIcon";

interface PageIconButtonProps {
  ownedById: string;
  entityId: string;
  versionId?: string;
  readonly?: boolean;
  size?: SizeVariant;
  hasDarkBg?: boolean;
  onClick?: MouseEventHandler<HTMLButtonElement>;
  popoverProps?: EmojiPickerPopoverProps;
  sx?: SxProps<Theme>;
}

export const PageIconButton = ({
  ownedById,
  entityId,
  versionId,
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
          <PageIcon
            ownedById={ownedById}
            entityId={entityId}
            versionId={versionId}
            size={size}
          />
        </IconButton>
      </Tooltip>
      <EmojiPicker
        popoverProps={popoverProps}
        popupState={popupState}
        onEmojiSelect={(emoji) => {
          void updatePageIcon(emoji.native, ownedById, entityId);
        }}
      />
    </>
  );
};
