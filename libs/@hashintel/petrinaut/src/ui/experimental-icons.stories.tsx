import { useState } from "react";

import {
  Checkbox,
  Icon,
  IconProvider,
  LoadingSpinner,
  SegmentedControl,
} from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import {
  DEFAULT_LANGUAGE_CLIENT_CONTEXT,
  LanguageClientContext,
} from "../react/lsp/context";
import {
  ExperimentalIcon,
  ExperimentalIconProvider,
  experimentalIconNames,
  experimentalIconEffects,
  PlayIcon,
} from "./experimental-icons";
import { petriconStudies } from "./petricon";
import { DiagnosticsIndicator } from "./views/Editor/components/BottomBar/diagnostics-indicator";

import type {
  ExperimentalIconVariant,
  ExperimentalIconEffect,
  ExperimentalIconChoreography,
  ExperimentalIconTransition,
  ExperimentalIconBadgeVisibility,
  ExperimentalIconStatus,
  ExperimentalIconName,
} from "./experimental-icons";
import type { Meta, StoryObj } from "@storybook/react-vite";

const galleryStyle = css({
  padding: "6",
  color: "neutral.fg.heading",
  backgroundColor: "neutral.bg.surface",
  minHeight: "[100vh]",
});

const controlsStyle = css({
  display: "flex",
  flexWrap: "wrap",
  gap: "6",
  alignItems: "center",
  marginY: "6",
  fontSize: "sm",
});

const gridStyle = css({
  display: "grid",
  gridTemplateColumns: "[repeat(auto-fill, minmax(160px, 1fr))]",
  gap: "4",
});

const tileStyle = css({
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: "4",
  padding: "6",
  borderWidth: "[1px]",
  borderStyle: "solid",
  borderColor: "neutral.a30",
  borderRadius: "lg",
  fontSize: "xs",
});

const titleStyle = css({ fontSize: "xl", fontWeight: "semibold" });
const noteStyle = css({ fontSize: "sm", marginTop: "2" });
const inputStyle = css({
  borderWidth: "[1px]",
  borderStyle: "solid",
  borderColor: "neutral.a50",
  borderRadius: "md",
  paddingX: "2",
  paddingY: "1",
});

const MotionShowcase = ({
  variant,
  motion,
  onMotionChange,
}: {
  variant: ExperimentalIconVariant;
  motion: boolean;
  onMotionChange: (enabled: boolean) => void;
}) => {
  const [effect, setEffect] = useState<ExperimentalIconEffect>("bounce");
  const [duration, setDuration] = useState(700);
  const [choreography, setChoreography] =
    useState<ExperimentalIconChoreography>("stagger");
  const [transition, setTransition] =
    useState<ExperimentalIconTransition>("spring");
  const [trigger, setTrigger] = useState(0);
  const [looping, setLooping] = useState(false);
  const [withPulse, setWithPulse] = useState(false);
  const [sampleChecked, setSampleChecked] = useState(true);
  const [editSelected, setEditSelected] = useState(false);
  const [simulateMode, setSimulateMode] = useState<"experiments" | "scenarios">(
    "experiments",
  );
  const [badge, setBadge] = useState<ExperimentalIconBadgeVisibility>("hover");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [diagnosticStatus, setDiagnosticStatus] =
    useState<ExperimentalIconStatus>("valid");
  const [diagnosticCount, setDiagnosticCount] = useState(3);
  const [selected, setSelected] = useState<"addPlace" | "addTransition" | null>(
    null,
  );
  const [morphName, setMorphName] = useState<"addPlace" | "addTransition">(
    "addPlace",
  );
  const effects =
    withPulse && effect !== "pulse" ? [effect, "pulse" as const] : effect;
  const cycleDiagnostics = () =>
    setDiagnosticStatus(
      diagnosticStatus === "valid"
        ? "error"
        : diagnosticStatus === "error"
          ? "warning"
          : "valid",
    );

  return (
    <section aria-label="Icon animations">
      <h2 className={titleStyle}>Effects and transitions</h2>
      <p className={noteStyle}>
        Replay an effect, select a tool, or change the shape. Motion follows
        your system preference. Hover over an add icon to reveal its plus.
      </p>
      <div className={controlsStyle}>
        <label>
          Effect{" "}
          <select
            aria-label="Effect"
            className={inputStyle}
            value={effect}
            onChange={(event) =>
              setEffect(
                experimentalIconEffects.find(
                  (candidate) => candidate === event.target.value,
                ) ?? "bounce",
              )
            }
          >
            {experimentalIconEffects.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Timing{" "}
          <select
            aria-label="Timing"
            className={inputStyle}
            value={choreography}
            onChange={(event) =>
              setChoreography(
                event.target.value === "together"
                  ? "together"
                  : event.target.value === "sequential"
                    ? "sequential"
                    : "stagger",
              )
            }
          >
            <option value="together">Together</option>
            <option value="stagger">Staggered</option>
            <option value="sequential">One at a time</option>
          </select>
        </label>
        <label>
          Duration {duration}ms{" "}
          <input
            aria-label="Effect duration"
            type="range"
            min={200}
            max={2400}
            step={100}
            value={duration}
            onChange={(event) => setDuration(event.target.valueAsNumber)}
          />
        </label>
        <label>
          <input
            type="checkbox"
            checked={withPulse}
            onChange={(event) => setWithPulse(event.target.checked)}
          />{" "}
          Add pulse
        </label>
        <label>
          <input
            type="checkbox"
            checked={looping}
            onChange={(event) => setLooping(event.target.checked)}
          />{" "}
          Loop
        </label>
        <label>
          <input
            type="checkbox"
            checked={motion}
            onChange={(event) => onMotionChange(event.target.checked)}
          />{" "}
          Enable motion
        </label>
        <button
          type="button"
          className={inputStyle}
          onClick={() => setTrigger((count) => count + 1)}
        >
          Replay effects
        </button>
        <label>
          Plus badge{" "}
          <select
            aria-label="Plus badge"
            className={inputStyle}
            value={badge}
            onChange={(event) =>
              setBadge(
                event.target.value === "visible"
                  ? "visible"
                  : event.target.value === "hidden"
                    ? "hidden"
                    : "hover",
              )
            }
          >
            <option value="hover">On hover</option>
            <option value="visible">Always</option>
            <option value="hidden">Hidden</option>
          </select>
        </label>
        <label>
          Transition{" "}
          <select
            aria-label="Transition"
            className={inputStyle}
            value={transition}
            onChange={(event) =>
              setTransition(
                event.target.value === "none"
                  ? "none"
                  : event.target.value === "smooth"
                    ? "smooth"
                    : "spring",
              )
            }
          >
            <option value="spring">Spring</option>
            <option value="smooth">Smooth</option>
            <option value="none">None</option>
          </select>
        </label>
      </div>
      <ExperimentalIconProvider
        size={64}
        duration={duration}
        motion={motion ? "auto" : "none"}
      >
        <div
          className={css({
            display: "grid",
            gridTemplateColumns: "[repeat(auto-fit, minmax(200px, 1fr))]",
            gap: "4",
            marginBottom: "6",
          })}
        >
          <button
            type="button"
            className={tileStyle}
            aria-pressed={editSelected}
            onClick={() => setEditSelected(!editSelected)}
          >
            <ExperimentalIcon
              name="shapes"
              selected={editSelected}
              transition={transition}
            />
            <span>Edit mode</span>
            <span>{editSelected ? "Selected" : "Select view"}</span>
          </button>
          {(["experiments", "scenarios"] as const).map((mode) => (
            <button
              type="button"
              key={mode}
              className={tileStyle}
              aria-pressed={simulateMode === mode}
              onClick={() => setSimulateMode(mode)}
            >
              <ExperimentalIcon
                name={mode === "experiments" ? "flask" : "layer"}
                selected={simulateMode === mode}
                variant={variant}
                transition={transition}
              />
              <span>
                {mode === "experiments" ? "Experiments" : "Scenarios"}
              </span>
              <span>{simulateMode === mode ? "Selected" : "Select view"}</span>
            </button>
          ))}
          {(["addPlace", "addTransition"] as const).map((name) => (
            <button
              type="button"
              key={name}
              className={tileStyle}
              aria-pressed={selected === name}
              onClick={() => setSelected(selected === name ? null : name)}
            >
              <ExperimentalIcon
                name={name}
                variant={selected === name ? "filled" : variant}
                selected={selected === name}
                badge={badge}
                effect={effects}
                trigger={trigger}
                active={looping ? true : undefined}
                choreography={choreography}
                transition={transition}
              />
              <span>
                {name === "addPlace" ? "Add Place" : "Add Transition"}
              </span>
              <span>{selected === name ? "Selected" : "Select tool"}</span>
            </button>
          ))}
          <button
            type="button"
            className={tileStyle}
            onClick={() =>
              setMorphName(
                morphName === "addPlace" ? "addTransition" : "addPlace",
              )
            }
          >
            <ExperimentalIcon
              name={morphName}
              badge={badge}
              variant={variant}
              transition={transition}
            />
            <span>Change shape</span>
            <span>
              {morphName === "addPlace"
                ? "Place → Transition"
                : "Transition → Place"}
            </span>
          </button>
          <button
            type="button"
            className={tileStyle}
            aria-pressed={!sidebarCollapsed}
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          >
            <ExperimentalIcon
              name="sidebar"
              collapsed={sidebarCollapsed}
              variant={variant}
              transition={transition}
            />
            <span>Sidebar</span>
            <span>
              {sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            </span>
          </button>
          <button
            type="button"
            className={tileStyle}
            aria-pressed={settingsOpen}
            onClick={() => setSettingsOpen(!settingsOpen)}
          >
            <ExperimentalIcon
              name="settings"
              variant={variant}
              open={settingsOpen}
              transition={transition}
            />
            <span>Settings</span>
            <span>{settingsOpen ? "Open" : "Closed"}</span>
          </button>
          <button
            type="button"
            className={tileStyle}
            aria-pressed={menuOpen}
            onClick={() => setMenuOpen(!menuOpen)}
          >
            <ExperimentalIcon
              name="menu"
              open={menuOpen}
              transition={transition}
            />
            <span>Menu</span>
            <span>{menuOpen ? "Open" : "Closed"}</span>
          </button>
          <button
            type="button"
            className={tileStyle}
            aria-pressed={playing}
            onClick={() => setPlaying(!playing)}
          >
            <ExperimentalIcon
              name="playback"
              playing={playing}
              transition={transition}
            />
            <span>Playback</span>
            <span>{playing ? "Playing" : "Paused"}</span>
          </button>
          <button
            type="button"
            className={tileStyle}
            aria-pressed={muted}
            onClick={() => setMuted(!muted)}
          >
            <ExperimentalIcon
              name="microphone"
              muted={muted}
              transition={transition}
            />
            <span>Microphone</span>
            <span>{muted ? "Muted" : "On"}</span>
          </button>
          <button
            type="button"
            className={tileStyle}
            onClick={cycleDiagnostics}
          >
            <ExperimentalIcon
              name="diagnostics"
              status={diagnosticStatus}
              transition={transition}
              color={
                diagnosticStatus === "valid"
                  ? "#16a34a"
                  : diagnosticStatus === "warning"
                    ? "#d97706"
                    : "#dc2626"
              }
            />
            <span>Diagnostics</span>
            <span>{diagnosticStatus}</span>
          </button>
        </div>
        <div className={controlsStyle}>
          <span>Diagnostics button</span>
          <LanguageClientContext
            value={{
              ...DEFAULT_LANGUAGE_CLIENT_CONTEXT,
              totalDiagnosticsCount:
                diagnosticStatus === "valid" ? 0 : diagnosticCount,
              errorDiagnosticsCount:
                diagnosticStatus === "error" ? diagnosticCount : 0,
            }}
          >
            <DiagnosticsIndicator
              onClick={cycleDiagnostics}
              isExpanded={false}
            />
          </LanguageClientContext>
          <label>
            Issue count{" "}
            <input
              type="number"
              min={1}
              max={9999}
              value={diagnosticCount}
              className={inputStyle}
              onChange={(event) => {
                const nextCount = event.target.valueAsNumber;
                if (Number.isFinite(nextCount)) {
                  setDiagnosticCount(
                    Math.min(9999, Math.max(1, Math.floor(nextCount))),
                  );
                }
              }}
            />
          </label>
          <span>
            Click the badge to cycle through errors, warnings, and valid.
          </span>
        </div>
        <div className={controlsStyle}>
          <SegmentedControl
            aria-label="Simulation views"
            value={simulateMode}
            onChange={setSimulateMode}
            layout="vertical"
            size="sm"
            items={[
              {
                value: "experiments",
                iconName: "flask",
                tooltip: "Experiments",
              },
              { value: "scenarios", iconName: "layer", tooltip: "Scenarios" },
            ]}
          />
          <span>
            Hover or switch views to move the liquid and separate the layers.
          </span>
          <Checkbox
            label="Example checkbox"
            value={sampleChecked}
            onChange={setSampleChecked}
            size="sm"
          />
          <Checkbox
            label="Disabled checkbox"
            value
            disabled
            onChange={() => {}}
            size="sm"
          />
          <span>Loading</span>
          <LoadingSpinner size="md" />
        </div>
      </ExperimentalIconProvider>
    </section>
  );
};

const Gallery = () => {
  const [motion, setMotion] = useState(true);
  const [query, setQuery] = useState("");
  const [weight, setWeight] = useState(400);
  const [size, setSize] = useState(24);
  const [variant, setVariant] = useState<ExperimentalIconVariant>("outline");
  const names = experimentalIconNames.filter((name) =>
    name.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <main className={galleryStyle}>
      <h1 className={titleStyle}>Petricon</h1>
      <p className={noteStyle}>
        Petrinaut SVG icons. Compare their weight, size, and filled shapes.
        Hover over a tile to preview its action hint.
      </p>
      <div className={controlsStyle}>
        <label>
          Search{" "}
          <input
            className={inputStyle}
            type="search"
            placeholder="Find an icon"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <label>
          Weight {weight}{" "}
          <input
            type="range"
            min={100}
            max={700}
            step={25}
            value={weight}
            onChange={(event) => setWeight(event.target.valueAsNumber)}
          />
        </label>
        <label>
          Size {size}px{" "}
          <input
            type="range"
            min={12}
            max={48}
            step={4}
            value={size}
            onChange={(event) => setSize(event.target.valueAsNumber)}
          />
        </label>
        <label>
          Style{" "}
          <select
            className={inputStyle}
            value={variant}
            onChange={(event) =>
              setVariant(event.target.value === "filled" ? "filled" : "outline")
            }
          >
            <option value="outline">Outline</option>
            <option value="filled">Filled</option>
          </select>
        </label>
      </div>
      <ExperimentalIconProvider
        size={size}
        weight={weight}
        motion={motion ? "auto" : "none"}
      >
        <MotionShowcase
          variant={variant}
          motion={motion}
          onMotionChange={setMotion}
        />
        <div className={gridStyle}>
          {names.map((name) => (
            <div key={name} className={tileStyle} data-icon-preview>
              <ExperimentalIcon
                name={name}
                variant={variant}
                effect={name === "loading" ? "rotate" : undefined}
                active={name === "loading"}
                duration={1100}
              />
              <span>{name}</span>
            </div>
          ))}
        </div>
        <p className={noteStyle}>
          Partial-pack fallback example: only play is overridden here.{" "}
          <IconProvider icons={{ play: PlayIcon }}>
            <Icon name="barcode" size="sm" alt="Default barcode icon" />
          </IconProvider>
        </p>
      </ExperimentalIconProvider>
    </main>
  );
};

const meta = {
  title: "Petrinaut/Petricon",
  id: "petrinaut-experimental-icon-pack",
  component: Gallery,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof Gallery>;

export default meta;
type Story = StoryObj<typeof meta>;
export const Catalog: Story = {};

const ModelingSample = ({
  name,
  draw,
  progress,
}: {
  name: ExperimentalIconName;
  draw: boolean;
  progress: number | undefined;
}) => {
  const [trigger, setTrigger] = useState(0);
  return (
    <button
      type="button"
      className={tileStyle}
      onClick={() => setTrigger(trigger + 1)}
    >
      <ExperimentalIcon
        name={name}
        size={44}
        effect={draw ? "draw" : "action"}
        trigger={trigger}
        duration={draw ? 720 : 400}
        choreography="stagger"
        drawProgress={progress}
      />
      {name}
    </button>
  );
};

const ModelingShowcase = () => {
  const [draw, setDraw] = useState(false);
  const [scrub, setScrub] = useState(false);
  const [progress, setProgress] = useState(1);
  return (
    <ExperimentalIconProvider>
      <div className={galleryStyle}>
        <h1 className={titleStyle}>Modeling studies</h1>
        <p className={noteStyle}>
          Hover for a hint. Click for an action, or draw each symbol
          progressively.
        </p>
        <div className={controlsStyle}>
          <label>
            <input
              type="checkbox"
              checked={draw}
              onChange={(event) => setDraw(event.target.checked)}
            />{" "}
            Draw on click
          </label>
          <label>
            <input
              type="checkbox"
              checked={scrub}
              onChange={(event) => setScrub(event.target.checked)}
            />{" "}
            Scrub drawing
          </label>
          <input
            type="range"
            aria-label="Drawing progress"
            min="0"
            max="1"
            step=".01"
            value={progress}
            onChange={(event) => setProgress(event.target.valueAsNumber)}
          />
        </div>
        <div className={gridStyle}>
          <ModelingSample
            name="clockRotateLeft"
            draw={draw}
            progress={scrub ? progress : undefined}
          />
          <ModelingSample
            name="reset"
            draw={draw}
            progress={scrub ? progress : undefined}
          />
        </div>
        {petriconStudies
          .filter((study) => study.category === "Modeling")
          .map((study) => (
            <section key={study.concept}>
              <h2 className={titleStyle}>{study.concept}</h2>
              <p className={noteStyle}>{study.motion}</p>
              <div className={gridStyle}>
                {study.names.map((name) => (
                  <ModelingSample
                    key={name}
                    name={name}
                    draw={draw}
                    progress={scrub ? progress : undefined}
                  />
                ))}
              </div>
            </section>
          ))}
      </div>
    </ExperimentalIconProvider>
  );
};

export const ModelingStudies: Story = { render: () => <ModelingShowcase /> };
