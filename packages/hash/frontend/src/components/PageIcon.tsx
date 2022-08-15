import { useQuery } from "@apollo/client";
import { faFile } from "@fortawesome/free-regular-svg-icons";
import { FontAwesomeIcon } from "@hashintel/hash-design-system/fontawesome-icon";
import { IconButton } from "@hashintel/hash-design-system/icon-button";
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
}

export const PageIcon = ({
  accountId,
  entityId,
  versionId,
  readonly,
  size = "medium",
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
        {/* @todo hover highlight of this is not visible on when rendered on the sidebar, fix the design */}
        <IconButton
          {...bindTrigger(popupState)}
          sx={{
            width: sizes.container,
            height: sizes.container,
            fontSize: sizes.font,
            [`&.${iconButtonClasses.disabled}`]: { color: "unset" },
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
