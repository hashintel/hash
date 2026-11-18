import { use, useEffect, useRef } from "react";

import { UserSettingsContext } from "./user-settings-context";

import type {
  BottomPanelTab,
  CursorMode,
  TimelineChartType,
} from "./editor-context";

/**
 * Debounced sync of EditorState panel-display values → UserSettingsContext.
 *
 * Skips the initial call on mount so we don't overwrite persisted settings
 * with defaults before the editor has had a chance to initialize from them.
 */
export const useSyncEditorToSettings = (values: {
  cursorMode: CursorMode;
  isLeftSidebarOpen: boolean;
  isBottomPanelOpen: boolean;
  activeBottomPanelTab: BottomPanelTab;
  timelineChartType: TimelineChartType;
}) => {
  const {
    setCursorMode,
    setIsLeftSidebarOpen,
    setIsBottomPanelOpen,
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
      setIsBottomPanelOpen(values.isBottomPanelOpen);
      setActiveBottomPanelTab(values.activeBottomPanelTab);
      setTimelineChartType(values.timelineChartType);
    }, 100);

    return () => clearTimeout(timerRef.current);
  }, [
    values.cursorMode,
    values.isLeftSidebarOpen,
    values.isBottomPanelOpen,
    values.activeBottomPanelTab,
    values.timelineChartType,
    setCursorMode,
    setIsLeftSidebarOpen,
    setIsBottomPanelOpen,
    setActiveBottomPanelTab,
    setTimelineChartType,
  ]);
};
