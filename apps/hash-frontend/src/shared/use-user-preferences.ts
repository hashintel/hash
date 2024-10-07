import type { VersionedUrl } from "@blockprotocol/type-system";
import type { EntityId } from "@local/hash-graph-types/entity";

import { useAuthInfo } from "../pages/shared/auth-info-context";

type EntityFavorite = {
  type: "entity";
  entityId: EntityId;
};

type EntityTypeFavorite = {
  type: "entityType";
  entityTypeId: VersionedUrl;
};

type PageFavorite = {
  type: "page";
  pageEntityId: EntityId;
};

export type Favorite = EntityFavorite | EntityTypeFavorite | PageFavorite;

export type UserPreferences = {
  favorites: Favorite[];
  sidebarSections: {
    entityTypes: {
      variant: "link" | "list";
      expanded: boolean;
    };
    entities: {
      variant: "link" | "list";
      expanded: boolean;
    };
    favorites: {
      expanded: boolean;
    };
    pages: {
      expanded: boolean;
    };
  };
};

const defaultUserPreferences: UserPreferences = {
  favorites: [],
  sidebarSections: {
    entityTypes: {
      variant: "link",
      expanded: false,
    },
    entities: {
      variant: "link",
      expanded: false,
    },
    favorites: {
      expanded: true,
    },
    pages: {
      expanded: true,
    },
  },
};

export const useUserPreferences = (): UserPreferences => {
  const { authenticatedUser } = useAuthInfo();

  return authenticatedUser?.preferences ?? defaultUserPreferences;
};
