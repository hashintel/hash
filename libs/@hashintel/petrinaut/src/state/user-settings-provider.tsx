import { useEffect, useState } from "react";

import type { BottomPanelTab, TimelineChartType } from "./editor-context";
import type {
  ArcRendering,
  SubViewSectionSettings,
  UserSettings,
} from "./user-settings-context";
import {
  defaultUserSettings,
  UserSettingsContext,
} from "./user-settings-context";

const STORAGE_KEY = "petrinaut:user-settings";

const loadSettings = (): UserSettings => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<UserSettings>;
      return { ...defaultUserSettings, ...parsed };
    }
  } catch {
    // Ignore corrupted or unavailable localStorage
  }
  return defaultUserSettings;
};

export const UserSettingsProvider: React.FC<React.PropsWithChildren> = ({
  children,
}) => {
  const [state, setState] = useState<UserSettings>(loadSettings);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Ignore write failures (e.g. quota exceeded)
    }
  }, [state]);

  const contextValue = {
    ...state,
    setShowAnimations: (value: boolean) =>
      setState((prev) => ({ ...prev, showAnimations: value })),
    setKeepPanelsMounted: (value: boolean) =>
      setState((prev) => ({ ...prev, keepPanelsMounted: value })),
    setCompactNodes: (value: boolean) =>
      setState((prev) => ({ ...prev, compactNodes: value })),
    setArcRendering: (value: ArcRendering) =>
      setState((prev) => ({ ...prev, arcRendering: value })),
    setIsLeftSidebarOpen: (value: boolean) =>
      setState((prev) => ({ ...prev, isLeftSidebarOpen: value })),
    setLeftSidebarWidth: (value: number) =>
      setState((prev) => ({ ...prev, leftSidebarWidth: value })),
    setPropertiesPanelWidth: (value: number) =>
      setState((prev) => ({ ...prev, propertiesPanelWidth: value })),
    setIsBottomPanelOpen: (value: boolean) =>
      setState((prev) => ({ ...prev, isBottomPanelOpen: value })),
    setBottomPanelHeight: (value: number) =>
      setState((prev) => ({ ...prev, bottomPanelHeight: value })),
    setActiveBottomPanelTab: (value: BottomPanelTab) =>
      setState((prev) => ({ ...prev, activeBottomPanelTab: value })),
    setTimelineChartType: (value: TimelineChartType) =>
      setState((prev) => ({ ...prev, timelineChartType: value })),
    updateSubViewSection: (
      containerName: string,
      sectionId: string,
      update: Partial<SubViewSectionSettings>,
    ) =>
      setState((prev) => {
        const existing = prev.subViewPanels[containerName]?.[sectionId];
        const merged: SubViewSectionSettings = {
          collapsed: existing?.collapsed ?? false,
          ...update,
        };
        return {
          ...prev,
          subViewPanels: {
            ...prev.subViewPanels,
            [containerName]: {
              ...prev.subViewPanels[containerName],
              [sectionId]: merged,
            },
          },
        };
      }),
  };

  return (
    <UserSettingsContext value={contextValue}>{children}</UserSettingsContext>
  );
};
