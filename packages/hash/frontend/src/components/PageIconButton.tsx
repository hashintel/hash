import { IconButton } from "@hashintel/hash-design-system";
import { iconButtonClasses, Tooltip } from "@mui/material";
import { bindTrigger, usePopupState } from "material-ui-popup-state/hooks";
import { rewriteEntityIdentifier } from "../lib/entities";

import { EmojiPicker } from "./EmojiPicker/EmojiPicker";
import { useBlockProtocolUpdateEntity } from "./hooks/blockProtocolFunctions/useBlockProtocolUpdateEntity";
import { PageIcon, SizeVariant } from "./PageIcon";

interface PageIconButtonProps {
  accountId: string;
  entityId: string;
  versionId?: string;
  readonly?: boolean;
  size?: SizeVariant;
  hasDarkBg?: boolean;
}

export const PageIconButton = ({
  accountId,
  entityId,
  versionId,
  readonly,
  size = "medium",
  hasDarkBg,
}: PageIconButtonProps) => {
  const popupState = usePopupState({
    variant: "popover",
    popupId: "emoji-picker",
  });

  const { updateEntity, updateEntityLoading } =
    useBlockProtocolUpdateEntity(true);

  return (
    <>
      <Tooltip title="Change icon" placement="bottom">
        <IconButton
          {...bindTrigger(popupState)}
          sx={({ palette }) => {
            const background = hasDarkBg ? palette.gray[40] : palette.gray[30];

            return {
              p: 0,
              ...(popupState.isOpen && {
                background,
              }),
              "&:focus-visible, &:hover": {
                background,
              },
              [`&.${iconButtonClasses.disabled}`]: { color: "unset" },
            };
          }}
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
