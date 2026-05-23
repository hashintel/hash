import { faFile } from "@fortawesome/free-regular-svg-icons";
import { useCallback } from "react";

import { FontAwesomeIcon } from "@hashintel/design-system";
import { systemEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";

import { useDefaultState } from "../components/hooks/use-default-state";
import {
  EditEmojiIconButton,
  iconVariantSizes,
} from "./edit-emoji-icon-button";
import { CanvasIcon } from "./icons/canvas-icon";
import { useUpdatePageIcon } from "./use-update-page-icon";

import type { SizeVariant } from "./edit-emoji-icon-button";
import type { EmojiPickerPopoverProps } from "./edit-emoji-icon-button/emoji-picker/emoji-picker";
import type { EntityId, VersionedUrl } from "@blockprotocol/type-system";
import type { SxProps, Theme } from "@mui/material";
import type { MouseEventHandler } from "react";

type PageIconButtonProps = {
  entityId: EntityId;
  pageEntityTypeId: VersionedUrl;
  icon?: string | null;
  readonly?: boolean;
  size?: SizeVariant;
  hasDarkBg?: boolean;
  onClick?: MouseEventHandler<HTMLButtonElement>;
  popoverProps?: EmojiPickerPopoverProps;
  sx?: SxProps<Theme>;
};

export const PageIconButton = ({
  entityId,
  pageEntityTypeId,
  icon: iconFromProps,
  size = "medium",
  ...remainingProps
}: PageIconButtonProps) => {
  const [icon, setIcon] = useDefaultState(iconFromProps);

  const [updatePageIcon] = useUpdatePageIcon();

  const isCanvas = pageEntityTypeId === systemEntityTypes.canvas.entityTypeId;

  const handleChange = useCallback(
    async (updatedIcon: string) => {
      await updatePageIcon(updatedIcon, entityId);
      setIcon(updatedIcon);
    },
    [updatePageIcon, setIcon, entityId],
  );

  return (
    <EditEmojiIconButton
      icon={icon}
      size={size}
      onChange={handleChange}
      defaultIcon={
        isCanvas ? (
          <CanvasIcon
            sx={{
              fill: ({ palette }) => palette.gray[40],
              fontSize: iconVariantSizes[size].font + 2,
            }}
          />
        ) : (
          <FontAwesomeIcon
            icon={faFile}
            sx={(theme) => ({
              fontSize: `${iconVariantSizes[size].font}px !important`,
              color: theme.palette.gray[40],
            })}
          />
        )
      }
      {...remainingProps}
    />
  );
};
