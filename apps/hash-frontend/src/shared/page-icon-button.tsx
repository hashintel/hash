import { VersionedUrl } from "@blockprotocol/type-system/slim";
import { faFile } from "@fortawesome/free-regular-svg-icons";
import { FontAwesomeIcon } from "@hashintel/design-system";
import { systemEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import { EntityId } from "@local/hash-subgraph";
import { SxProps, Theme } from "@mui/material";
import { MouseEventHandler, useCallback } from "react";

import { useDefaultState } from "../components/hooks/use-default-state";
import {
  EditIconButton,
  iconVariantSizes,
  SizeVariant,
} from "./edit-icon-button";
import { EmojiPickerPopoverProps } from "./edit-icon-button/emoji-picker/emoji-picker";
import { CanvasIcon } from "./icons/canvas-icon";
import { useUpdatePageIcon } from "./use-update-page-icon";

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
    <EditIconButton
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
