import { useQuery } from "@apollo/client";
import { faFile } from "@fortawesome/free-regular-svg-icons";
import { FontAwesomeIcon, IconButton } from "@hashintel/hash-design-system";
import { getPageInfoQuery } from "@hashintel/hash-shared/queries/page.queries";
import { iconButtonClasses, Tooltip } from "@mui/material";
import { bindTrigger, usePopupState } from "material-ui-popup-state/hooks";
import {
  GetPageInfoQuery,
  GetPageInfoQueryVariables,
} from "../graphql/apiTypes.gen";
import { rewriteEntityIdentifier } from "../lib/entities";

import { EmojiPicker } from "./EmojiPicker/EmojiPicker";
import { useBlockProtocolUpdateEntity } from "./hooks/blockProtocolFunctions/useBlockProtocolUpdateEntity";

type SizeVariant = "small" | "medium";

const variantSizes: Record<SizeVariant, { container: number; font: number }> = {
  small: { container: 20, font: 14 },
  medium: { container: 44, font: 36 },
};

interface PageIconProps {
  accountId: string;
  entityId: string;
  versionId?: string;
  readonly?: boolean;
  size?: SizeVariant;
  hasDarkBg?: boolean;
}

export const PageIcon = ({
  accountId,
  entityId,
  versionId,
  readonly,
  size = "medium",
  hasDarkBg,
}: PageIconProps) => {
  const popupState = usePopupState({
    variant: "popover",
    popupId: "emoji-picker",
  });

  const { updateEntity, updateEntityLoading } =
    useBlockProtocolUpdateEntity(true);

  const { data } = useQuery<GetPageInfoQuery, GetPageInfoQueryVariables>(
    getPageInfoQuery,
    {
      variables: { entityId, accountId, versionId },
    },
  );

  const sizes = variantSizes[size];

  return (
    <>
      <Tooltip title="Change icon" placement="bottom">
        <IconButton
          {...bindTrigger(popupState)}
          sx={({ palette }) => {
            const background = hasDarkBg ? palette.gray[40] : palette.gray[30];

            return {
              width: sizes.container,
              height: sizes.container,
              fontSize: sizes.font,
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
          {data?.page?.properties?.icon || (
            <FontAwesomeIcon
              icon={faFile}
              sx={(theme) => ({
                fontSize: `${sizes.font}px !important`,
                color: theme.palette.gray[40],
              })}
            />
          )}
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
