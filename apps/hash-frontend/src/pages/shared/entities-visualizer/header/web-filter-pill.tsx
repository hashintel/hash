import { Box, Divider, ListItemText, Menu } from "@mui/material";
import { bindMenu, usePopupState } from "material-ui-popup-state/hooks";
import { useCallback, useMemo } from "react";

import { MenuCheckboxItem } from "@hashintel/design-system";

import { useGetOwnerForEntity } from "../../../../components/hooks/use-get-owner-for-entity";
import { HouseRegularIcon } from "../../../../shared/icons/house-regular-icon";
import { FilterPill } from "./filter-pill";

import type { EntitiesFilterState } from "../data/types";
import type { WebId } from "@blockprotocol/type-system";
import type { FunctionComponent } from "react";

type WebFilterPillProps = {
  internalWebIds: WebId[];
  webState: EntitiesFilterState["web"];
  setWebState: (
    updater: (prev: EntitiesFilterState["web"]) => EntitiesFilterState["web"],
  ) => void;
};

const buildLabel = ({
  internalWebIds,
  selectedInternalWebIds,
  includeOtherWebs,
}: {
  internalWebIds: WebId[];
  selectedInternalWebIds: Set<WebId>;
  includeOtherWebs: boolean;
}): string => {
  const selectedCount = internalWebIds.filter((id) =>
    selectedInternalWebIds.has(id),
  ).length;
  const totalCount = internalWebIds.length;
  const allSelected = selectedCount === totalCount;

  if (includeOtherWebs) {
    if (allSelected) {
      return "Any web";
    }
    if (selectedCount === 0) {
      return "Other webs";
    }
    return `Other webs + ${selectedCount} own`;
  }

  if (allSelected) {
    return totalCount === 1 ? "Your web" : "Your webs";
  }
  if (selectedCount === 0) {
    return "No webs";
  }
  return `${selectedCount} of ${totalCount} webs`;
};

export const WebFilterPill: FunctionComponent<WebFilterPillProps> = ({
  internalWebIds,
  webState,
  setWebState,
}) => {
  const popupState = usePopupState({
    variant: "popover",
    popupId: "entities-visualizer-web-filter-pill",
  });

  const getOwnerForEntity = useGetOwnerForEntity();

  const webItems = useMemo(
    () =>
      internalWebIds.map((webId) => {
        const { shortname } = getOwnerForEntity({ webId });
        return {
          webId,
          label: shortname ? `@${shortname}` : webId,
        };
      }),
    [internalWebIds, getOwnerForEntity],
  );

  const toggleInternalWeb = useCallback(
    (webId: WebId) => {
      setWebState((prev) => {
        const next = new Set(prev.selectedInternalWebIds);
        if (next.has(webId)) {
          next.delete(webId);
        } else {
          next.add(webId);
        }
        return { ...prev, selectedInternalWebIds: next };
      });
    },
    [setWebState],
  );

  const toggleOtherWebs = useCallback(() => {
    setWebState((prev) => ({
      ...prev,
      includeOtherWebs: !prev.includeOtherWebs,
    }));
  }, [setWebState]);

  const label = buildLabel({
    internalWebIds,
    selectedInternalWebIds: webState.selectedInternalWebIds,
    includeOtherWebs: webState.includeOtherWebs,
  });

  const allInternalSelected =
    webState.selectedInternalWebIds.size === internalWebIds.length &&
    internalWebIds.every((id) => webState.selectedInternalWebIds.has(id));

  const isActive = !allInternalSelected || webState.includeOtherWebs;

  return (
    <Box>
      <FilterPill
        icon={HouseRegularIcon}
        prefix="Web is"
        value={label}
        active={isActive}
        popupState={popupState}
      />
      <Menu
        {...bindMenu(popupState)}
        anchorOrigin={{ vertical: 30, horizontal: "left" }}
        transformOrigin={{ vertical: "top", horizontal: "left" }}
      >
        {webItems.map(({ webId, label: itemLabel }) => (
          <MenuCheckboxItem
            key={webId}
            selected={webState.selectedInternalWebIds.has(webId)}
            onClick={() => toggleInternalWeb(webId)}
            sx={{ minWidth: 220 }}
          >
            <ListItemText primary={itemLabel} />
          </MenuCheckboxItem>
        ))}
        <Divider />
        <MenuCheckboxItem
          selected={webState.includeOtherWebs}
          onClick={toggleOtherWebs}
        >
          <ListItemText primary="Other webs" />
        </MenuCheckboxItem>
      </Menu>
    </Box>
  );
};
