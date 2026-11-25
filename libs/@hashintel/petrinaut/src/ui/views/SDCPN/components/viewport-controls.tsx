import { Button } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";
import { SettingsIcon } from "@hashintel/ds-icons";

import {
  usePetrinautNavigate,
  usePetrinautNavigationState,
} from "../../../../react/navigation/navigation";
import { useEditorActions } from "../../../../react/state/editor-context";
import { PluginToolbarItems } from "../../../plugins/plugin-outlets";
import { usePetrinautPresentation } from "../../../presentation/presentation-context";
import { styleRef } from "../../../shared/readings";
import { VIEWPORT_CONTROLS_OFFSET } from "../../../shared/ui-constants";
import { useCanvasInsetsReader } from "../../../shared/use-canvas-insets";
import { useCanvasController } from "../canvas-renderer";

const containerStyle = css({
  position: "absolute",
  display: "flex",
  flexDirection: "column",
  gap: "[2px]",
  zIndex: "[900]",
});

const blurredBackground = css({ backdropFilter: "[blur(10px)]" });

export const ViewportControls: React.FC = () => {
  const presentation = usePetrinautPresentation();
  const navigate = usePetrinautNavigate();
  const isSettingsOpen = usePetrinautNavigationState(
    ({ overlay }) =>
      overlay?.type === "user-settings" ||
      overlay?.type === "viewport-settings",
  );
  const chromeBackground = presentation.blurredChrome
    ? blurredBackground
    : undefined;
  // Fit view goes through the canvas controller like the zooms: these
  // controls sit above the renderer contract and must not reach for a
  // renderer's own API.
  const { fitView, zoomIn, zoomOut } = useCanvasController();
  const { collapseAllPanels } = useEditorActions();

  const readInsets = useCanvasInsetsReader();

  return (
    <div
      className={containerStyle}
      ref={styleRef({
        right: () => VIEWPORT_CONTROLS_OFFSET + readInsets().right,
        bottom: () => VIEWPORT_CONTROLS_OFFSET + readInsets().bottom,
      })}
    >
      <Button
        size="xs"
        variant="subtle"
        aria-label="Zoom in"
        tooltip="Zoom in"
        tooltipOptions={{ position: "left" }}
        iconName="plus"
        className={chromeBackground}
        onClick={zoomIn}
      />
      <Button
        size="xs"
        variant="subtle"
        aria-label="Zoom out"
        tooltip="Zoom out"
        tooltipOptions={{ position: "left" }}
        iconName="dash"
        className={chromeBackground}
        onClick={zoomOut}
      />
      <Button
        size="xs"
        variant="subtle"
        aria-label="Fit view"
        tooltip="Fit view"
        tooltipOptions={{ position: "left" }}
        iconName="collapse"
        className={chromeBackground}
        onClick={() => {
          void fitView();
        }}
      />
      {presentation.showViewportSettings && (
        <>
          <Button
            size="xs"
            variant="subtle"
            aria-label="Fullscreen"
            tooltip="Fullscreen"
            tooltipOptions={{ position: "left" }}
            iconName="expand"
            className={chromeBackground}
            onClick={collapseAllPanels}
          />
          <Button
            size="xs"
            variant="subtle"
            aria-label="Lock view"
            tooltip="Lock view"
            tooltipOptions={{ position: "left" }}
            iconName="lockOpen"
            className={chromeBackground}
            onClick={() => {
              // Placeholder for future lock view functionality
            }}
          />
          <Button
            size="xs"
            variant="subtle"
            aria-label="Viewport settings"
            tooltip="Viewport settings"
            tooltipOptions={{ position: "left" }}
            prefix={
              <SettingsIcon size={12} open={isSettingsOpen} duration={240} />
            }
            className={chromeBackground}
            onClick={() =>
              navigate(
                { overlay: { type: "user-settings", section: "viewport" } },
                { cause: "user", action: "overlay" },
              )
            }
          />
        </>
      )}
      <PluginToolbarItems
        place="viewport-controls"
        buttonClassName={chromeBackground}
      />
    </div>
  );
};
