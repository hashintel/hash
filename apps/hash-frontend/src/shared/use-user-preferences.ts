import { useMemo, useSyncExternalStore } from "react";

import { useAuthInfo } from "../pages/shared/auth-info-context";

import type { EntityId, VersionedUrl } from "@blockprotocol/type-system";

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

/**
 * A partial update to {@link UserPreferences}, merged into the latest persisted
 * preferences at write time. `favorites` may be an updater function so that
 * concurrent favorite changes compose rather than overwrite each other.
 */
export type UserPreferencesUpdate = {
  favorites?: Favorite[] | ((currentFavorites: Favorite[]) => Favorite[]);
  sidebarSections?: {
    [Section in keyof UserPreferences["sidebarSections"]]?: Partial<
      UserPreferences["sidebarSections"][Section]
    >;
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

export const mergeUserPreferences = (
  currentPreferences: UserPreferences | undefined,
  update: UserPreferencesUpdate,
): UserPreferences => {
  const base = currentPreferences ?? defaultUserPreferences;
  const { favorites, sidebarSections } = update;

  return {
    favorites:
      typeof favorites === "function"
        ? favorites(base.favorites)
        : (favorites ?? base.favorites),
    sidebarSections: {
      entityTypes: {
        ...base.sidebarSections.entityTypes,
        ...sidebarSections?.entityTypes,
      },
      entities: {
        ...base.sidebarSections.entities,
        ...sidebarSections?.entities,
      },
      favorites: {
        ...base.sidebarSections.favorites,
        ...sidebarSections?.favorites,
      },
      pages: {
        ...base.sidebarSections.pages,
        ...sidebarSections?.pages,
      },
    },
  };
};

/**
 * Preference updates currently in flight, overlaid on the server-confirmed
 * preferences by {@link useUserPreferences} so all consumers reflect changes
 * immediately. An entry is removed once its update settles: on success the
 * refetched user already includes it, on failure the UI reverts to the
 * server state.
 */
type PendingPreferencesUpdate = { update: UserPreferencesUpdate };

let pendingUpdates: readonly PendingPreferencesUpdate[] = [];

const pendingUpdateListeners = new Set<() => void>();

const getPendingUpdates = () => pendingUpdates;

const subscribeToPendingUpdates = (onChange: () => void) => {
  pendingUpdateListeners.add(onChange);
  return () => {
    pendingUpdateListeners.delete(onChange);
  };
};

const emitPendingUpdatesChange = () => {
  for (const onChange of pendingUpdateListeners) {
    onChange();
  }
};

/**
 * Overlay an in-flight preferences update – returns a function which removes
 * the overlay again, to be called once the update has settled.
 */
export const trackPendingPreferencesUpdate = (
  update: UserPreferencesUpdate,
): (() => void) => {
  const entry: PendingPreferencesUpdate = { update };

  pendingUpdates = [...pendingUpdates, entry];
  emitPendingUpdatesChange();

  return () => {
    pendingUpdates = pendingUpdates.filter((pending) => pending !== entry);
    emitPendingUpdatesChange();
  };
};

export const useUserPreferences = (): UserPreferences => {
  const { authenticatedUser } = useAuthInfo();

  const pending = useSyncExternalStore(
    subscribeToPendingUpdates,
    getPendingUpdates,
    getPendingUpdates,
  );

  const serverPreferences = authenticatedUser?.preferences;

  return useMemo(
    () =>
      pending.reduce(
        (mergedPreferences, { update }) =>
          mergeUserPreferences(mergedPreferences, update),
        serverPreferences ?? defaultUserPreferences,
      ),
    [pending, serverPreferences],
  );
};
