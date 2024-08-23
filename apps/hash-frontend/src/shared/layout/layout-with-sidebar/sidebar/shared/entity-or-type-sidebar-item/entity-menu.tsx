import type { VersionedUrl } from "@blockprotocol/type-system";
import {
  faAdd,
  faAsterisk,
  faChain,
  faList,
} from "@fortawesome/free-solid-svg-icons";
import { pluralize } from "@local/hash-isomorphic-utils/pluralize";
import { extractBaseUrl } from "@local/hash-subgraph/type-system-patch";
import { Box, Menu } from "@mui/material";
import type { PopupState } from "material-ui-popup-state/hooks";
import { bindMenu } from "material-ui-popup-state/hooks";
import type { FunctionComponent } from "react";

import { useEntityTypesContextRequired } from "../../../../../entity-types-context/hooks/use-entity-types-context-required";
import { generateLinkParameters } from "../../../../../generate-link-parameters";
import { FavoriteMenuItem } from "./shared/favorite-menu-item";
import { SidebarMenuItem } from "./shared/sidebar-menu-item";

type EntityTypeMenuProps = {
  entityTypeId: VersionedUrl;
  popupState: PopupState;
  isLinkType?: boolean;
  entityTypeIcon?: string | null;
  title: string;
};

export const EntityMenu: FunctionComponent<EntityTypeMenuProps> = ({
  entityTypeId,
  entityTypeIcon,
  isLinkType,
  popupState,
  title,
}) => {
  const { isSpecialEntityTypeLookup } = useEntityTypesContextRequired();

  const isLinkEntityType = isSpecialEntityTypeLookup?.[entityTypeId]?.isLink;

  return (
    <Menu {...bindMenu(popupState)}>
      {isLinkEntityType ? null : (
        <SidebarMenuItem
          title={`Create new ${pluralize.singular(title)}`}
          icon={faAdd}
          href={`/new/entity?entity-type-id=${entityTypeId}`}
          popupState={popupState}
        />
      )}
      <FavoriteMenuItem
        item={{ type: "entityType", entityTypeId }}
        popupState={popupState}
      />
      <SidebarMenuItem
        title={`View all ${pluralize(title)}`}
        icon={faList}
        popupState={popupState}
        href={`/entities?entityTypeIdOrBaseUrl=${extractBaseUrl(entityTypeId)}`}
      />
      <SidebarMenuItem
        title="View Type"
        icon={
          entityTypeIcon ? (
            <Box component="span">{entityTypeIcon}</Box>
          ) : isLinkType ? (
            faChain
          ) : (
            faAsterisk
          )
        }
        href={generateLinkParameters(entityTypeId).href}
        popupState={popupState}
      />
    </Menu>
  );
};
