import {
  Box,
  Checkbox,
  chipClasses,
  Divider,
  ListItemText,
  Menu,
} from "@mui/material";
import {
  bindMenu,
  bindTrigger,
  usePopupState,
} from "material-ui-popup-state/hooks";
import { useCallback, useMemo } from "react";

import { CaretDownSolidIcon, Chip } from "@hashintel/design-system";

import { useGetOwnerForEntity } from "../../../../components/hooks/use-get-owner-for-entity";
import { HouseRegularIcon } from "../../../../shared/icons/house-regular-icon";
import { MenuItem } from "../../../../shared/ui";

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
      return "All webs";
    }
    if (selectedCount === 0) {
      return "Other webs";
    }
    return `Other webs + ${selectedCount} own`;
  }

  if (allSelected) {
    return totalCount === 1 ? "Your web" : "All your webs";
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

  return (
    <Box>
      <Chip
        icon={
          <HouseRegularIcon
            sx={{ fill: ({ palette }) => palette.primary.main }}
          />
        }
        label={
          <Box
            component="span"
            display="inline-flex"
            alignItems="center"
            gap={0.6}
          >
            {label}
            <CaretDownSolidIcon
              sx={{
                fontSize: 12,
                transform: `rotate(${popupState.isOpen ? 180 : 0}deg)`,
              }}
            />
          </Box>
        }
        sx={{
          height: 24,
          border: ({ palette }) => `1px solid ${palette.gray[30]}`,
          background: ({ palette }) => palette.gray[5],
          cursor: "pointer",
          [`.${chipClasses.label}`]: {
            color: ({ palette }) => palette.gray[70],
            fontSize: 13,
            fontWeight: 500,
          },
        }}
        {...bindTrigger(popupState)}
      />
      <Menu
        {...bindMenu(popupState)}
        anchorOrigin={{ vertical: 30, horizontal: "left" }}
        transformOrigin={{ vertical: "top", horizontal: "left" }}
      >
        {webItems.map(({ webId, label: itemLabel }) => {
          const checked = webState.selectedInternalWebIds.has(webId);
          return (
            <MenuItem
              key={webId}
              onClick={() => toggleInternalWeb(webId)}
              sx={{ minWidth: 220 }}
            >
              <Checkbox
                checked={checked}
                sx={{ p: 0, mr: 1, svg: { width: 14, height: 14 } }}
              />
              <ListItemText primary={itemLabel} />
            </MenuItem>
          );
        })}
        <Divider />
        <MenuItem onClick={toggleOtherWebs}>
          <Checkbox
            checked={webState.includeOtherWebs}
            sx={{ p: 0, mr: 1, svg: { width: 14, height: 14 } }}
          />
          <ListItemText primary="Other webs" />
        </MenuItem>
      </Menu>
    </Box>
  );
};
