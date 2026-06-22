import { Box, Divider, ListItemText, Menu } from "@mui/material";
import { bindMenu, usePopupState } from "material-ui-popup-state/hooks";
import { useCallback, useMemo } from "react";

import { MenuCheckboxItem } from "@hashintel/design-system";

import { HouseRegularIcon } from "../../../../shared/icons/house-regular-icon";
import { FilterPill } from "./filter-pill";

import type { EntitiesFilterState } from "../shared/filter-state";
import type { WebId } from "@blockprotocol/type-system";
import type { FunctionComponent } from "react";

export type InternalWeb = {
  webId: WebId;
  name: string;
};

type WebFilterPillProps = {
  internalWebs: InternalWeb[];
  webState: EntitiesFilterState["web"];
  setWebState: (
    updater: (prev: EntitiesFilterState["web"]) => EntitiesFilterState["web"],
  ) => void;
};

const buildLabel = ({
  internalWebs,
  selectedInternalWebIds,
  includeOtherWebs,
}: {
  internalWebs: InternalWeb[];
  selectedInternalWebIds: Set<WebId>;
  includeOtherWebs: boolean;
}): string => {
  const selectedWebs = internalWebs.filter(({ webId }) =>
    selectedInternalWebIds.has(webId),
  );
  const selectedCount = selectedWebs.length;
  const totalCount = internalWebs.length;
  const allSelected = selectedCount === totalCount;
  const selectedWebName =
    selectedCount === 1 ? selectedWebs[0]!.name : undefined;

  if (includeOtherWebs) {
    if (allSelected) {
      return "any";
    }
    if (selectedCount === 0) {
      return "not yours";
    }
    if (selectedWebName) {
      return `other + ${selectedWebName}`;
    }
    return `Other webs + ${selectedCount} own`;
  }

  if (allSelected) {
    return totalCount === 1 ? (selectedWebName ?? "yours") : "one of yours";
  }

  if (selectedCount === 0) {
    return "none";
  }
  if (selectedWebName) {
    return selectedWebName;
  }
  return `${selectedCount} of ${totalCount} webs`;
};

export const WebFilterPill: FunctionComponent<WebFilterPillProps> = ({
  internalWebs,
  webState,
  setWebState,
}) => {
  const popupState = usePopupState({
    variant: "popover",
    popupId: "entities-visualizer-web-filter-pill",
  });

  const webItems = useMemo(
    () =>
      internalWebs.map(({ webId, name }) => ({
        webId,
        label: name,
      })),
    [internalWebs],
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
    internalWebs,
    selectedInternalWebIds: webState.selectedInternalWebIds,
    includeOtherWebs: webState.includeOtherWebs,
  });

  const allInternalSelected =
    webState.selectedInternalWebIds.size === internalWebs.length &&
    internalWebs.every(({ webId }) =>
      webState.selectedInternalWebIds.has(webId),
    );

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
