import { use, useEffect, useRef } from "react";

import type {
  BottomPanelTab,
  CursorMode,
  TimelineChartType,
} from "./editor-context";
import { UserSettingsContext } from "./user-settings-context";

/**
 * Debounced sync of EditorState panel-display values → UserSettingsContext.
 *
 * Skips the initial call on mount so we don't overwrite persisted settings
 * with defaults before the editor has had a chance to initialize from them.
 */
export const useSyncEditorToSettings = (values: {
  cursorMode: CursorMode;
  isLeftSidebarOpen: boolean;
  leftSidebarWidth: number;
  propertiesPanelWidth: number;
  isBottomPanelOpen: boolean;
  bottomPanelHeight: number;
  activeBottomPanelTab: BottomPanelTab;
  timelineChartType: TimelineChartType;
}) => {
  const {
    setCursorMode,
    setIsLeftSidebarOpen,
    setLeftSidebarWidth,
    setPropertiesPanelWidth,
    setIsBottomPanelOpen,
    setBottomPanelHeight,
    setActiveBottomPanelTab,
    setTimelineChartType,
  } = use(UserSettingsContext);

  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const mountedRef = useRef(false);

  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }

    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setCursorMode(values.cursorMode);
      setIsLeftSidebarOpen(values.isLeftSidebarOpen);
      setLeftSidebarWidth(values.leftSidebarWidth);
      setPropertiesPanelWidth(values.propertiesPanelWidth);
      setIsBottomPanelOpen(values.isBottomPanelOpen);
      setBottomPanelHeight(values.bottomPanelHeight);
      setActiveBottomPanelTab(values.activeBottomPanelTab);
      setTimelineChartType(values.timelineChartType);
    }, 100);

    return () => clearTimeout(timerRef.current);
  }, [
    values.cursorMode,
    values.isLeftSidebarOpen,
    values.leftSidebarWidth,
    values.propertiesPanelWidth,
    values.isBottomPanelOpen,
    values.bottomPanelHeight,
    values.activeBottomPanelTab,
    values.timelineChartType,
    setCursorMode,
    setIsLeftSidebarOpen,
    setLeftSidebarWidth,
    setPropertiesPanelWidth,
    setIsBottomPanelOpen,
    setBottomPanelHeight,
    setActiveBottomPanelTab,
    setTimelineChartType,
  ]);
};
