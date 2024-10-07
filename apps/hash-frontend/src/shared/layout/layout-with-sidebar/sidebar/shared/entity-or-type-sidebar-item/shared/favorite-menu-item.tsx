import { StarIconRegular, StarIconSolid } from "@hashintel/design-system";
import type { PopupState } from "material-ui-popup-state/hooks";
import { useMemo } from "react";

import { useUpdateAuthenticatedUser } from "../../../../../../../components/hooks/use-update-authenticated-user";
import type { Favorite } from "../../../../../../use-user-preferences";
import { useUserPreferences } from "../../../../../../use-user-preferences";
import { SidebarMenuItem } from "./sidebar-menu-item";

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
  const preferences = useUserPreferences();

  const isFavorite = useMemo(
    () =>
      preferences.favorites.some((favorite) => matchFavorite(favorite, item)),
    [item, preferences.favorites],
  );

  const [updateUser] = useUpdateAuthenticatedUser();

  const toggleFavorite = () => {
    const newFavorites = isFavorite
      ? preferences.favorites.filter(
          (favorite) => !matchFavorite(favorite, item),
        )
      : [...preferences.favorites, item];

    void updateUser({
      preferences: {
        ...preferences,
        favorites: newFavorites,
      },
    });

    popupState.close();
  };

  return (
    <SidebarMenuItem
      title={`${isFavorite ? "Remove from" : "Add to"} favorites`}
      icon={isFavorite ? <StarIconSolid /> : <StarIconRegular />}
      onClick={toggleFavorite}
      popupState={popupState}
    />
  );
};
