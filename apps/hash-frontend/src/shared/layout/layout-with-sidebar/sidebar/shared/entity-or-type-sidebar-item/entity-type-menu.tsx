import { faAdd, faLink, faList } from "@fortawesome/free-solid-svg-icons";
import { Menu } from "@mui/material";
import { bindMenu } from "material-ui-popup-state/hooks";
import { useState } from "react";

import { extractBaseUrl } from "@blockprotocol/type-system";
import { ArrowUpRightIcon } from "@hashintel/design-system";

import { useEntityTypesContextRequired } from "../../../../../entity-types-context/hooks/use-entity-types-context-required";
import { useFrozenValue } from "../../../../../frozen";
import { useUserPermissionsOnEntityType } from "../../../../../use-user-permissions-on-entity-type";
import { FavoriteMenuItem } from "./shared/favorite-menu-item";
import { SidebarMenuItem } from "./shared/sidebar-menu-item";

import type { BaseUrl, VersionedUrl } from "@blockprotocol/type-system";
import type { PopupState } from "material-ui-popup-state/hooks";
import type { FunctionComponent } from "react";

type EntityTypeMenuProps = {
  entityTypeId: VersionedUrl;
  popupState: PopupState;
  title: string;
  titlePlural: string;
  url: BaseUrl;
};

// @todo-mui get free icons that matches the design closely
export const EntityTypeMenu: FunctionComponent<EntityTypeMenuProps> = ({
  entityTypeId,
  popupState,
  title,
  titlePlural,
  url,
}) => {
  const [copied, setCopied] = useState(false);
  const copiedFrozen = useFrozenValue(copied, !popupState.isOpen);

  const { isSpecialEntityTypeLookup } = useEntityTypesContextRequired();

  const isLinkEntityType = isSpecialEntityTypeLookup?.[entityTypeId]?.isLink;

  // Fetch on mount, not on open, so permission-gated items are already resolved
  // by the time the menu opens – avoids the list shifting under the cursor
  const { userPermissions } = useUserPermissionsOnEntityType(entityTypeId);

  const canInstantiate = !!userPermissions?.instantiate;

  return (
    <Menu {...bindMenu(popupState)}>
      {isLinkEntityType || !canInstantiate ? null : (
        <SidebarMenuItem
          title={`Create new ${title}`}
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
        title={copiedFrozen ? "Copied!" : `Copy link to ${title}`}
        icon={faLink}
        popupState={popupState}
        onClick={() => {
          void navigator.clipboard.writeText(url);
          setCopied(true);
          setTimeout(() => {
            setCopied(false);
            popupState.close();
          }, 2000);
        }}
      />
      {/* Extending requires permission to instantiate the parent type */}
      {canInstantiate ? (
        <SidebarMenuItem
          title="Extend this type"
          icon={<ArrowUpRightIcon sx={{ fontSize: 16 }} />}
          href={`/new/types/entity-type?extends=${entityTypeId}`}
          popupState={popupState}
        />
      ) : null}
      <SidebarMenuItem
        title={`View all ${isLinkEntityType ? `${title} links` : titlePlural}`}
        icon={faList}
        popupState={popupState}
        href={`/entities?entityTypeIdOrBaseUrl=${extractBaseUrl(entityTypeId)}`}
      />
    </Menu>
  );
};
