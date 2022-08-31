import {
  fontAwesomeIconClasses,
  IconButton,
} from "@hashintel/hash-design-system";
import { iconButtonClasses, Tooltip, SxProps, Theme } from "@mui/material";
import { SystemStyleObject } from "@mui/system";
import { bindTrigger, usePopupState } from "material-ui-popup-state/hooks";
import { MouseEventHandler } from "react";
import { rewriteEntityIdentifier } from "../lib/entities";

import {
  EmojiPicker,
  EmojiPickerPopoverProps,
} from "./EmojiPicker/EmojiPicker";
import { useBlockProtocolUpdateEntity } from "./hooks/blockProtocolFunctions/useBlockProtocolUpdateEntity";
import { PageIcon, SizeVariant } from "./PageIcon";

interface PageIconButtonProps {
  accountId: string;
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
  accountId,
  entityId,
  versionId,
  readonly,
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

  const { updateEntity, updateEntityLoading } =
    useBlockProtocolUpdateEntity(true);

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
          disabled={readonly || updateEntityLoading}
        >
          <PageIcon
            accountId={accountId}
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
          void updateEntity({
            data: {
              entityId: rewriteEntityIdentifier({
                accountId,
                entityId,
              }),
              properties: { icon: emoji.native },
            },
          });
        }}
      />
    </>
  );
};
