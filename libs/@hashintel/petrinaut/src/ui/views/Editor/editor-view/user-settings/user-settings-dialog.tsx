import { Tabs } from "@ark-ui/react/tabs";
import {
  use,
  useId,
  useRef,
  useState,
  type AriaAttributes,
  type ReactNode,
} from "react";

import { Chip, Dialog, Icon, Select, Toggle } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";
import { isWebGpuAvailable } from "@hashintel/petrinaut-core";
import { isConnectedOptimization } from "@hashintel/petrinaut-core/optimization";

import { PetrinautOptimizationContext } from "../../../../../react/optimization-context";
import { SDCPNContext } from "../../../../../react/state/sdcpn-context";
import { UserSettingsContext } from "../../../../../react/state/user-settings-context";
import { focusLands } from "../../../../worksheet/focus-flow";
import { FocusRoot, FocusStack } from "../../../../worksheet/focus-stack";
import { useFocusMember } from "../../../../worksheet/use-focus-member";
import { FloatingResizeHandles } from "../../shared/floating-resize-handles";
import { useFloatingPanel } from "../../shared/use-floating-panel";
import { SettingsHeading } from "./user-settings-dialog/settings-heading";
import { SettingsPanel } from "./user-settings-dialog/settings-panel";

import type { PetrinautSettingsSection } from "../../../../../react/navigation";
import type { IconName } from "@hashintel/ds-components";

const settingsDialogStyles = {
  position: "fixed",
  userSelect: "none",
  "&": {
    padding: "0",
    overflow: "visible",
    border: "[1px solid {colors.neutral.s50}]",
  },
  '[data-overlay-stack-root]:has(&) > [data-part="backdrop"]': {
    background: "[transparent]",
  },
} as const;
const settingsDialogStyle = css(settingsDialogStyles);

const sections = [
  {
    id: "general",
    label: "General",
    icon: "sliders",
    description: "Make Petrinaut feel right for you.",
  },
  {
    id: "viewport",
    label: "Viewport",
    icon: "grid",
    description: "Choose how your net looks and responds.",
  },
  {
    id: "simulation",
    label: "Simulation",
    icon: "play",
    description: "Explore more ways to run and optimize your models.",
  },
  {
    id: "labs",
    label: "Labs",
    icon: "flask",
    description: "Try features that are still taking shape.",
  },
] as const satisfies readonly {
  id: PetrinautSettingsSection;
  label: string;
  icon: IconName;
  description: string;
}[];

const layoutStyle = css({
  position: "relative",
  _before: {
    content: '""',
    position: "absolute",
    top: "0",
    insetInline: "0",
    height: "3",
    cursor: "grab",
    touchAction: "none",
  },
  display: "grid",
  gridTemplateColumns: "[160px minmax(0, 1fr)]",
  height: "full",
  overflow: "hidden",
  borderRadius: "[inherit]",
  minHeight: "0",
  "@media (max-width: 600px)": {
    gridTemplateColumns: "[124px minmax(0, 1fr)]",
  },
});

const sidebarStyle = css({
  userSelect: "none",
  gridArea: "[1 / 1]",
  display: "flex",
  flexDirection: "column",
  gap: "1",
  padding: "3",
  background: "neutral.s10",
  borderRight: "[1px solid {colors.neutral.s40}]",
  overflowY: "auto",
  "@media (max-width: 600px)": { padding: "2" },
});

const tabStyle = css({
  userSelect: "none",
  display: "flex",
  alignItems: "center",
  gap: "2.5",
  paddingX: "3",
  paddingY: "2",
  borderRadius: "lg",
  fontSize: "sm",
  fontWeight: "medium",
  textAlign: "left",
  color: "neutral.fg.body",
  cursor: "pointer",
  position: "relative",
  transition:
    "[background-color 140ms ease, color 140ms ease, box-shadow 140ms ease]",
  _hover: { background: "neutral.s20", color: "neutral.fg.heading" },
  _selected: {
    background: "neutral.s00",
    color: "neutral.fg.heading",
    boxShadow:
      "[0 1px 3px rgba(0, 0, 0, 0.06), 0 0 0 1px {colors.neutral.s40}]",
  },
  _focusVisible: {
    outline: "[2px solid {colors.blue.s70}]",
    outlineOffset: "[2px]",
  },
  "@media (max-width: 600px)": { paddingX: "2", gap: "2", fontSize: "xs" },
  "@media (prefers-reduced-motion: reduce)": { transition: "[none]" },
});

const descriptionStyle = css({
  fontSize: "xs",
  color: "neutral.fg.body",
  lineHeight: "[1.6]",
});
const groupStyle = css({
  border: "[1px solid {colors.neutral.s40}]",
  borderRadius: "xl",
  overflow: "hidden",
  marginTop: "3",
});
const groupTitleStyle = css({
  paddingX: "3",
  paddingY: "1.5",
  background: "neutral.s10",
  borderBottom: "[1px solid {colors.neutral.s40}]",
  fontSize: "xs",
  fontWeight: "medium",
  color: "neutral.fg.subtle",
});
const rowStyle = css({
  display: "grid",
  gridTemplateColumns: "[minmax(0, 1fr) auto]",
  alignItems: "center",
  gap: "4",
  paddingX: "3",
  paddingY: "2.5",
  "& + &": { borderTop: "[1px solid {colors.neutral.s30}]" },
  "@media (max-width: 600px)": {
    padding: "3",
    gap: "2",
    "&[data-wide-control]": { gridTemplateColumns: "[minmax(0, 1fr)]" },
  },
});
const labelStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "1.5",
  fontSize: "sm",
  fontWeight: "medium",
  color: "neutral.fg.heading",
  marginBottom: "0.5",
  lineHeight: "[1.4]",
});

const SettingsGroup = ({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) => (
  <section className={groupStyle} aria-label={title}>
    <h3 className={groupTitleStyle}>{title}</h3>
    {children}
  </section>
);

const SettingRow = ({
  label,
  description,
  experimental,
  wideControl,
  children,
}: {
  label: string;
  description: string;
  experimental?: boolean;
  wideControl?: boolean;
  children: (aria: AriaAttributes) => ReactNode;
}) => {
  const id = useId();
  const elementRef = useRef<HTMLDivElement>(null);
  const member = useFocusMember(() =>
    focusLands(
      elementRef.current?.querySelector<HTMLElement>(
        'input[type="checkbox"]:not(:disabled), button[role="combobox"]:not(:disabled)',
      ),
    ),
  );
  return (
    <div
      ref={(element) => {
        elementRef.current = element;
        member.attach(element);
      }}
      className={rowStyle}
      data-wide-control={wideControl || undefined}
      onKeyDownCapture={(event) => {
        const target = event.target;
        if (
          event.defaultPrevented ||
          event.altKey ||
          event.ctrlKey ||
          event.metaKey ||
          event.shiftKey ||
          !(target instanceof HTMLElement) ||
          !event.currentTarget.contains(target) ||
          target.getAttribute("aria-expanded") === "true"
        ) {
          return;
        }
        const direction =
          event.key === "ArrowUp"
            ? "up"
            : event.key === "ArrowDown"
              ? "down"
              : event.key === "ArrowLeft"
                ? "left"
                : event.key === "ArrowRight"
                  ? "right"
                  : null;
        if (direction) {
          event.preventDefault();
          event.stopPropagation();
          member.moveFrom(direction);
        }
      }}
    >
      <div>
        <div className={labelStyle}>
          <span id={`${id}-label`}>{label}</span>
          {experimental && (
            <div
              id={`${id}-experimental`}
              className={css({ display: "flex", flexShrink: "0" })}
            >
              <Chip size="xs" color="orange" variant="outline" shape="round">
                Experimental
              </Chip>
            </div>
          )}
        </div>
        <p id={`${id}-description`} className={descriptionStyle}>
          {description}
        </p>
      </div>
      {children({
        "aria-labelledby": `${id}-label`,
        "aria-describedby": experimental
          ? `${id}-experimental ${id}-description`
          : `${id}-description`,
      })}
    </div>
  );
};

const SettingToggle = ({
  label,
  description,
  experimental,
  value,
  onChange,
  disabled,
}: {
  label: string;
  description: string;
  experimental?: boolean;
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) => (
  <SettingRow
    label={label}
    description={description}
    experimental={experimental}
  >
    {(aria) => (
      <Toggle
        {...aria}
        value={value}
        onChange={onChange}
        disabled={disabled}
        size="sm"
      />
    )}
  </SettingRow>
);

const SettingsTabs = () => {
  const elementRef = useRef<HTMLDivElement>(null);
  const member = useFocusMember(() =>
    focusLands(
      elementRef.current?.querySelector<HTMLElement>('[aria-selected="true"]'),
    ),
  );

  return (
    <Tabs.List
      ref={(element) => {
        elementRef.current = element;
        member.attach(element);
      }}
      aria-label="Settings sections"
      className={sidebarStyle}
      onKeyDown={(event) => {
        if (
          !event.defaultPrevented &&
          !event.altKey &&
          !event.ctrlKey &&
          !event.metaKey &&
          !event.shiftKey &&
          (event.key === "ArrowRight" || event.key === "ArrowLeft")
        ) {
          event.preventDefault();
          event.stopPropagation();
          member.moveFrom(event.key === "ArrowRight" ? "right" : "left");
        }
      }}
    >
      {sections.map((item) => (
        <Tabs.Trigger key={item.id} value={item.id} className={tabStyle}>
          <Icon name={item.icon} size="sm" />
          {item.label}
        </Tabs.Trigger>
      ))}
    </Tabs.List>
  );
};

export const UserSettingsDialog = ({
  section,
  onSectionChange,
  onClose,
}: {
  section: PetrinautSettingsSection;
  onSectionChange: (section: PetrinautSettingsSection) => void;
  onClose: () => void;
}) => {
  const settings = use(UserSettingsContext);
  const { extensions } = use(SDCPNContext);
  const optimization = use(PetrinautOptimizationContext);
  const inBrowserOptimizationOffered =
    optimization !== null && isConnectedOptimization(optimization);
  const webGpuAvailable = isWebGpuAvailable();
  const item =
    sections.find((candidate) => candidate.id === section) ?? sections[0];
  const headingRef = useRef<HTMLElement>(null);
  const [width, setWidth] = useState(760);
  const { panelRef, handleProps, getResizeHandleProps, style } =
    useFloatingPanel<HTMLDivElement>({
      width,
      onWidthChange: setWidth,
      initialHeight: 480,
      initialPosition: "center",
      limits: { minWidth: 520, maxWidth: Infinity, gap: 20 },
    });

  return (
    <Dialog
      ref={panelRef}
      style={style}
      size="lg"
      aria-label="User settings"
      className={settingsDialogStyle}
      onClose={onClose}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <Dialog.Header
        className={css({
          position: "absolute",
          top: "3",
          right: "3",
          "&": {
            padding: "0",
            border: "[0]",
            background: "[transparent]",
          },
          zIndex: "[1]",
          "& button": { margin: "0" },
        })}
      />
      <Dialog.Body
        withPadding={false}
        className={css({
          "&": {
            overflow: "visible",
            border: "[0]",
            borderRadius: "[inherit]",
          },
        })}
      >
        <FloatingResizeHandles
          label="User settings"
          getHandleProps={getResizeHandleProps}
        />
        <Tabs.Root
          value={section}
          orientation="vertical"
          onValueChange={({ value }) => {
            const selected = sections.find(
              (candidate) => candidate.id === value,
            );
            if (selected) onSectionChange(selected.id);
          }}
          className={layoutStyle}
          {...handleProps}
          onKeyDown={undefined}
          onPointerDown={(event) => {
            if (
              event.button !== 0 ||
              !headingRef.current ||
              event.clientY >
                headingRef.current.getBoundingClientRect().bottom ||
              (event.target instanceof Element &&
                event.target.closest(
                  "button, input, select, textarea, a, [role='tab'], [role='combobox']",
                ))
            )
              return;
            handleProps.onPointerDown(event);
          }}
        >
          <FocusRoot>
            <FocusStack axis="horizontal" contain>
              <SettingsTabs />
              <SettingsPanel
                section={section}
                headingRef={headingRef}
                animated={settings.showAnimations}
                heading={
                  <SettingsHeading
                    section={item}
                    animated={settings.showAnimations}
                  />
                }
              >
                <FocusStack key={section} axis="vertical">
                  {item.id === "general" && (
                    <>
                      <SettingsGroup title="Interface">
                        <SettingToggle
                          label="Animations"
                          description="Animate panel transitions and interface interactions."
                          value={settings.showAnimations}
                          onChange={settings.setShowAnimations}
                        />
                        <SettingToggle
                          label="Keep panels mounted"
                          description="Keep hidden panels ready for faster switching. Uses more memory."
                          value={settings.keepPanelsMounted}
                          onChange={settings.setKeepPanelsMounted}
                        />
                      </SettingsGroup>
                      <SettingsGroup title="Getting started">
                        <SettingToggle
                          label="Show welcome guide"
                          description="Show the getting-started guide when you next open Petrinaut."
                          value={settings.showWalkthroughOnInit}
                          onChange={settings.setShowWalkthroughOnInit}
                        />
                      </SettingsGroup>
                    </>
                  )}
                  {item.id === "viewport" && (
                    <>
                      <SettingsGroup title="Appearance">
                        <SettingToggle
                          label="Minimap"
                          description="Show an overview of your net in the top-right corner."
                          value={settings.showMinimap}
                          onChange={settings.setShowMinimap}
                        />
                        <SettingToggle
                          label="Compact nodes"
                          description="Use smaller nodes to fit more of your net on screen."
                          value={settings.compactNodes}
                          onChange={settings.setCompactNodes}
                        />
                        <SettingToggle
                          label="Petricon"
                          experimental
                          description="Use Petrinaut's custom icon pack across the editor."
                          value={settings.enableExperimentalIconPack}
                          onChange={settings.setEnableExperimentalIconPack}
                        />
                        <SettingToggle
                          label="Automatic arc connections"
                          experimental
                          description="Connect node outlines and choose attachment directions automatically."
                          value={settings.enableAutomaticArcConnections}
                          onChange={settings.setEnableAutomaticArcConnections}
                        />
                        {!settings.enableAutomaticArcConnections && (
                          <SettingRow
                            label="Arc rendering"
                            description="Choose the shape of connections between nodes."
                            wideControl
                          >
                            {(aria) => (
                              <Select
                                {...aria}
                                size="sm"
                                className={css({
                                  width: "[156px]",
                                  maxWidth: "[100%]",
                                })}
                                required
                                value={settings.arcRendering}
                                onChange={settings.setArcRendering}
                                items={[
                                  { value: "smoothstep", text: "Square" },
                                  { value: "bezier", text: "Bezier" },
                                  { value: "custom", text: "Adaptive Bezier" },
                                ]}
                              />
                            )}
                          </SettingRow>
                        )}
                      </SettingsGroup>
                      <SettingsGroup title="Interaction">
                        <SettingToggle
                          label="Highlight on hover"
                          description="Highlight a node's neighborhood when the pointer rests on it."
                          value={settings.highlightOnHover}
                          onChange={settings.setHighlightOnHover}
                        />
                        <SettingToggle
                          label="Snap to grid"
                          description="Align nodes to the grid when placing or dragging them."
                          value={settings.snapToGrid}
                          onChange={settings.setSnapToGrid}
                        />
                        <SettingToggle
                          label="Partial selection"
                          description="Select nodes that are only partly inside the selection box."
                          value={settings.partialSelection}
                          onChange={settings.setPartialSelection}
                        />
                      </SettingsGroup>
                    </>
                  )}
                  {item.id === "simulation" && (
                    <>
                      <SettingsGroup title="Experiments">
                        <SettingToggle
                          label="WebGPU"
                          description={
                            webGpuAvailable
                              ? "Offer GPU compute for compatible experiments. Each experiment chooses its backend; CPU and GPU results agree statistically, not seed for seed."
                              : "WebGPU is unavailable in this browser. Experiments use the CPU."
                          }
                          value={settings.webGpuEnabled && webGpuAvailable}
                          onChange={settings.setWebGpuEnabled}
                          disabled={!webGpuAvailable}
                        />
                        <SettingToggle
                          label="Parameter sweeps"
                          description="Explore a range of numeric parameter values in one experiment."
                          value={settings.enableParameterSweeps}
                          onChange={settings.setEnableParameterSweeps}
                        />
                      </SettingsGroup>
                      {inBrowserOptimizationOffered && (
                        <SettingsGroup title="Optimization">
                          <SettingToggle
                            label="In-browser optimization"
                            description="Run studies in this browser and stream metrics as each step completes."
                            value={settings.enableInBrowserOptimization}
                            onChange={settings.setEnableInBrowserOptimization}
                          />
                        </SettingsGroup>
                      )}
                    </>
                  )}
                  {item.id === "labs" && (
                    <>
                      {extensions.subnets && (
                        <SettingsGroup title="Modeling">
                          <SettingToggle
                            label="Net Components"
                            description="Build hierarchical nets with subnet definitions and component instances."
                            value={settings.enableNetComponents}
                            onChange={settings.setEnableNetComponents}
                          />
                        </SettingsGroup>
                      )}
                      <SettingsGroup title="Developer tools">
                        <SettingToggle
                          label="Compilation output"
                          description="Add a Compilation tab to inspect generated code and GPU compatibility."
                          value={settings.showCompilationOutput}
                          onChange={settings.setShowCompilationOutput}
                        />
                      </SettingsGroup>
                    </>
                  )}
                </FocusStack>
              </SettingsPanel>
            </FocusStack>
          </FocusRoot>
        </Tabs.Root>
      </Dialog.Body>
    </Dialog>
  );
};
