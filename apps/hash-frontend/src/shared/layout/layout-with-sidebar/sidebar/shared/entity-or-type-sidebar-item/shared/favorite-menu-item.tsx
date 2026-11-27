import { useMemo } from "react";

import { StarRegularIcon, StarSolidIcon } from "@hashintel/design-system";

import { useUpdateAuthenticatedUser } from "../../../../../../../components/hooks/use-update-authenticated-user";
import { useEnabledSections } from "../../../../../../../pages/shared/use-enabled-sections";
import { useUserPreferences } from "../../../../../../use-user-preferences";
import { SidebarMenuItem } from "./sidebar-menu-item";

import type { Favorite } from "../../../../../../use-user-preferences";
import type { PopupState } from "material-ui-popup-state/hooks";

const matchFavorite = (item1: Favorite, item2: Favorite) => {
  switch (item1.type) {
    case "entity":
      return item2.type === "entity" && item1.entityId === item2.entityId;
    case "entityType":
      return (
        item2.type === "entityType" && item1.entityTypeId === item2.entityTypeId
      );
    case "page":
      return item2.type === "page" && item1.pageEntityId === item2.pageEntityId;
    default:
      return true;
  }
};

export const FavoriteMenuItem = ({
  item,
  popupState,
}: {
  item: Favorite;
  popupState: PopupState;
}) => {
  const enabledSections = useEnabledSections();
  const preferences = useUserPreferences();

  const isFavorite = useMemo(
    () =>
      preferences.favorites.some((favorite) => matchFavorite(favorite, item)),
    [item, preferences.favorites],
  );

  const [updateUser] = useUpdateAuthenticatedUser();

  const toggleFavorite = () => {
    void updateUser({
      preferences: {
        favorites: (currentFavorites) => {
          const withoutItem = currentFavorites.filter(
            (favorite) => !matchFavorite(favorite, item),
          );

          return isFavorite ? withoutItem : [...withoutItem, item];
        },
      },
    });

    popupState.close();
  };

  // The sidebar only lists favorites behind this flag, so without it a new
  // favorite would be saved and never shown.
  if (!enabledSections.favorites) {
    return null;
  }

  return (
    <SidebarMenuItem
      title={`${isFavorite ? "Remove from" : "Add to"} favorites`}
      icon={isFavorite ? <StarSolidIcon /> : <StarRegularIcon />}
      onClick={toggleFavorite}
      popupState={popupState}
    />
  );
};
