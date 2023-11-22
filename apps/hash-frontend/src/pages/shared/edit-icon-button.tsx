import { faAsterisk } from "@fortawesome/free-solid-svg-icons";
import {
  FontAwesomeIcon,
  fontAwesomeIconClasses,
  IconButton,
} from "@hashintel/design-system";
import { Box, iconButtonClasses, SxProps, Theme, Tooltip } from "@mui/material";
import { SystemStyleObject } from "@mui/system";
import { BaseEmoji } from "emoji-mart";
import { bindTrigger, usePopupState } from "material-ui-popup-state/hooks";
import {
  FunctionComponent,
  MouseEventHandler,
  ReactNode,
  useCallback,
  useState,
} from "react";

import { useDefaultState } from "../../components/hooks/use-default-state";
import {
  EmojiPicker,
  EmojiPickerPopoverProps,
} from "./edit-icon-button/emoji-picker/emoji-picker";

export type SizeVariant = "small" | "medium";

export const iconVariantSizes: Record<
  SizeVariant,
  { container: number; font: number }
> = {
  small: { container: 20, font: 14 },
  medium: { container: 44, font: 36 },
};

interface EditIconButtonProps {
  icon?: string | null;
  defaultIcon?: ReactNode;
  onChange: (updatedIcon: string) => Promise<void> | void;
  disabled?: boolean;
  size?: SizeVariant;
  hasDarkBg?: boolean;
  onClick?: MouseEventHandler<HTMLButtonElement>;
  popoverProps?: EmojiPickerPopoverProps;
  sx?: SxProps<Theme>;
}

export const EditIconButton: FunctionComponent<EditIconButtonProps> = ({
  icon: iconFromProps,
  disabled = false,
  defaultIcon,
  onChange,
  size = "medium",
  hasDarkBg,
  onClick,
  popoverProps,
  sx = [],
}) => {
  const [icon, setIcon] = useDefaultState(iconFromProps);

  const [loading, setLoading] = useState<boolean>(false);

  const popupState = usePopupState({
    variant: "popover",
    popupId: "emoji-picker",
  });

  const handleOnEmojiSelect = useCallback(
    async (emoji: BaseEmoji) => {
      const maybePromise = onChange(emoji.native);

      if (maybePromise) {
        setLoading(true);
        await maybePromise;
        setLoading(false);
      }

      setIcon(emoji.native);
    },
    [onChange, setLoading, setIcon],
  );

  const trigger = bindTrigger(popupState);

  const sizes = iconVariantSizes[size];

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
          disabled={disabled || loading}
        >
          <Box
            sx={[
              {
                width: sizes.container,
                height: sizes.container,
                fontSize: sizes.font,
                fontFamily: "auto",
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                svg: {
                  fontSize: `${sizes.font}px !important`,
                },
              },
            ]}
          >
            {icon ?? defaultIcon ?? (
              <FontAwesomeIcon
                icon={faAsterisk}
                sx={(theme) => ({
                  color: theme.palette.gray[40],
                })}
              />
            )}
          </Box>
        </IconButton>
      </Tooltip>
      <EmojiPicker
        popoverProps={popoverProps}
        popupState={popupState}
        onEmojiSelect={handleOnEmojiSelect}
      />
    </>
  );
};
