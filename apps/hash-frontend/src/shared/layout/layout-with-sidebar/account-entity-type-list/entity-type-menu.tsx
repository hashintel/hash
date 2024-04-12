import type { BaseUrl, VersionedUrl } from "@blockprotocol/type-system";
import { faAdd, faLink, faList } from "@fortawesome/free-solid-svg-icons";
import { ArrowUpRightIcon } from "@hashintel/design-system";
import { pluralize } from "@local/hash-isomorphic-utils/pluralize";
import { extractBaseUrl } from "@local/hash-subgraph/type-system-patch";
import { Menu } from "@mui/material";
import type { PopupState } from "material-ui-popup-state/hooks";
import { bindMenu } from "material-ui-popup-state/hooks";
import type { FunctionComponent } from "react";
import { useState } from "react";

import { useEntityTypesContextRequired } from "../../../entity-types-context/hooks/use-entity-types-context-required";
import { useFrozenValue } from "../../../frozen";
import { EntityTypeMenuItem } from "./entity-type-menu-item";

type EntityTypeMenuProps = {
  entityTypeId: VersionedUrl;
  popupState: PopupState;
  title: string;
  url: BaseUrl;
};

// @todo-mui get free icons that matches the design closely
export const EntityTypeMenu: FunctionComponent<EntityTypeMenuProps> = ({
  entityTypeId,
  popupState,
  title,
  url,
}) => {
  const [copied, setCopied] = useState(false);
  const copiedFrozen = useFrozenValue(copied, !popupState.isOpen);

  const { isSpecialEntityTypeLookup } = useEntityTypesContextRequired();

  const isLinkEntityType = isSpecialEntityTypeLookup?.[entityTypeId]?.isLink;

  return (
    <Menu {...bindMenu(popupState)}>
      {isLinkEntityType ? null : (
        <EntityTypeMenuItem
          title={`Create new ${pluralize.singular(title)}`}
          icon={faAdd}
          href={`/new/entity?entity-type-id=${entityTypeId}`}
          popupState={popupState}
        />
      )}
      <EntityTypeMenuItem
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
      <EntityTypeMenuItem
        title="Extend this type"
        icon={<ArrowUpRightIcon sx={{ fontSize: 16 }} />}
        href={`/new/types/entity-type?extends=${entityTypeId}`}
        popupState={popupState}
      />
      <EntityTypeMenuItem
        title={`View all ${pluralize(title)}`}
        icon={faList}
        popupState={popupState}
        href={`/entities?entityTypeIdOrBaseUrl=${extractBaseUrl(entityTypeId)}`}
      />
    </Menu>
  );
};
