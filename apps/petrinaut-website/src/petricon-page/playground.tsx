/**
 * @layerRoot website.petricon
 * @role Petricon's interactive collection, state inspector, and design studies
 */
import { useState } from "react";

import {
  Petricon,
  PetriconProvider,
  petriconCatalog,
  petriconEffects,
  getPetriconEffects,
  type PetriconName,
  type PetriconEffect,
  type PetriconTransition,
  type PetriconVariant,
  type PetriconChoreography,
} from "@hashintel/petrinaut/ui";

import { getGlyphState, statefulGlyphs } from "./glyph-demo";

const Inspector = ({
  name,
  motion,
}: {
  name: PetriconName;
  motion: boolean;
}) => {
  const [weight, setWeight] = useState(400);
  const [size, setSize] = useState(72);
  const [duration, setDuration] = useState(420);
  const [step, setStep] = useState(0);
  const [replay, setReplay] = useState(0);
  const [effect, setEffect] = useState<PetriconEffect | "state">(
    statefulGlyphs.has(name) ? "state" : "action",
  );
  const [choreography, setChoreography] =
    useState<PetriconChoreography>("stagger");
  const [manualDraw, setManualDraw] = useState(false);
  const [drawProgress, setDrawProgress] = useState(1);
  const [transition, setTransition] = useState<PetriconTransition>("spring");
  const [variant, setVariant] = useState<PetriconVariant>("outline");
  const [copied, setCopied] = useState("");
  const entry = petriconCatalog.find((candidate) => candidate.name === name);
  const state = getGlyphState(name, step);
  const stateAttribute =
    statefulGlyphs.has(name) && effect === "state"
      ? Object.entries(state)
          .map(([attribute, value]) =>
            typeof value === "boolean"
              ? `${attribute}={${String(value)}}`
              : `${attribute}="${String(value)}"`,
          )
          .join(" ")
      : effect === "draw" && manualDraw
        ? `drawProgress={${drawProgress}}`
        : `effect="${effect}" trigger={replay}`;
  const snippet = `<Petricon name="${name}"\n  size={${size}} weight={${weight}}\n  variant="${variant}"\n  ${stateAttribute}\n  choreography="${choreography}"\n  duration={${duration}}\n  transition="${transition}"\n/>`;

  return (
    <aside
      id="petricon-inspector"
      className="petricon-inspector"
      aria-label="Icon inspector"
    >
      <div className="petricon-inspector-heading">
        <span className="petricon-kicker">LIVE SPECIMEN</span>
        <span className="petricon-kicker">24 × 24</span>
      </div>
      <button
        type="button"
        className="petricon-specimen"
        aria-label={`Animate ${entry?.label ?? name}`}
        onClick={() => {
          if (effect === "state") {
            setStep(step + 1);
          } else {
            setReplay(replay + 1);
          }
        }}
      >
        <span className="petricon-crosshair" aria-hidden="true" />
        <Petricon
          name={name}
          size={size}
          weight={weight}
          variant={variant}
          duration={duration}
          transition={transition}
          effect={effect === "state" ? undefined : effect}
          trigger={replay}
          choreography={choreography}
          drawProgress={
            effect === "draw" && manualDraw ? drawProgress : undefined
          }
          {...state}
          motion={motion ? "auto" : "none"}
        />
        <span className="petricon-specimen-hint">
          Hover to hint. Click to play.
        </span>
      </button>
      <div className="petricon-inspector-title">
        <h3>{entry?.label}</h3>
        <span>{entry?.category}</span>
      </div>
      <div className="petricon-sliders">
        <label>
          <span>
            Weight <output>{weight}</output>
          </span>
          <input
            type="range"
            aria-label="Weight"
            min={100}
            max={700}
            step={25}
            value={weight}
            onChange={(event) => setWeight(event.target.valueAsNumber)}
          />
        </label>
        <label>
          <span>
            Size <output>{size}px</output>
          </span>
          <input
            type="range"
            aria-label="Size"
            min={16}
            max={96}
            step={4}
            value={size}
            onChange={(event) => setSize(event.target.valueAsNumber)}
          />
        </label>
        <label>
          <span>
            Duration <output>{duration}ms</output>
          </span>
          <input
            type="range"
            aria-label="Duration"
            min={160}
            max={1200}
            step={20}
            value={duration}
            onChange={(event) => setDuration(event.target.valueAsNumber)}
          />
        </label>
      </div>
      <div className="petricon-selects">
        <label>
          Style
          <select
            value={variant}
            onChange={(event) =>
              setVariant(event.target.value === "filled" ? "filled" : "outline")
            }
          >
            <option value="outline">Outline</option>
            <option value="filled">Filled</option>
          </select>
        </label>
        <label>
          Effect
          <select
            value={effect}
            onChange={(event) =>
              setEffect(
                event.target.value === "state"
                  ? "state"
                  : (petriconEffects.find(
                      (candidate) => candidate === event.target.value,
                    ) ?? "action"),
              )
            }
          >
            {statefulGlyphs.has(name) && <option value="state">state</option>}
            {getPetriconEffects(name).map((candidate) => (
              <option key={candidate} value={candidate}>
                {candidate}
              </option>
            ))}
          </select>
        </label>
        {effect === "draw" && (
          <label>
            Drawing order
            <select
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
              <option value="sequential">Stroke by stroke</option>
            </select>
          </label>
        )}
        <label>
          State transition
          <select
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
      {effect === "draw" && (
        <div className="petricon-sliders petricon-draw-controls">
          <label className="petricon-motion-toggle">
            <input
              type="checkbox"
              checked={manualDraw}
              onChange={(event) => setManualDraw(event.target.checked)}
            />
            Scrub drawing progress
          </label>
          {manualDraw && (
            <label>
              <span>
                Drawn <output>{Math.round(drawProgress * 100)}%</output>
              </span>
              <input
                type="range"
                aria-label="Drawing progress"
                min="0"
                max="1"
                step=".01"
                value={drawProgress}
                onChange={(event) =>
                  setDrawProgress(event.target.valueAsNumber)
                }
              />
            </label>
          )}
        </div>
      )}
      <div className="petricon-inspector-actions">
        {statefulGlyphs.has(name) && (
          <button type="button" onClick={() => setStep(step + 1)}>
            Change state <span aria-hidden="true">↔</span>
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            setManualDraw(false);
            if (effect === "state") setStep(step + 1);
            else setReplay(replay + 1);
          }}
        >
          Replay effect <span aria-hidden="true">↻</span>
        </button>
      </div>
      <pre className="petricon-code">
        <code>{snippet}</code>
      </pre>
      <button
        type="button"
        className="petricon-copy"
        onClick={() => {
          void navigator.clipboard.writeText(snippet).then(
            () => setCopied("Copied"),
            () => setCopied("Select the code above to copy"),
          );
        }}
      >
        {copied || "Copy React code"}
        <span aria-hidden="true">↗</span>
      </button>
      <span className="petricon-sr-only" role="status">
        {copied}
      </span>
    </aside>
  );
};

export const Playground = () => {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [selected, setSelected] = useState<PetriconName>("clockRotateLeft");
  const [expanded, setExpanded] = useState(false);
  const [motion, setMotion] = useState(true);
  const categories = [
    "All",
    "Modeling",
    "Navigation",
    "Editing",
    "Simulation",
    "Math",
    "Code",
    "AI",
    "Interface",
  ];
  const filtered = petriconCatalog.filter(
    (entry) =>
      (category === "All" || entry.category === category) &&
      `${entry.name} ${entry.label} ${entry.study ?? ""}`
        .toLowerCase()
        .includes(query.trim().toLowerCase()),
  );
  const visible =
    expanded || query || category !== "All" ? filtered : filtered.slice(0, 36);

  return (
    <PetriconProvider enabled motion={motion ? "auto" : "none"}>
      <div className="petricon-collection-controls">
        <label className="petricon-search">
          <Petricon name="search" size={18} />
          <input
            type="search"
            aria-label="Search icons"
            placeholder="Find an icon…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <span>{filtered.length}</span>
        </label>
        <label className="petricon-motion-toggle">
          <input
            type="checkbox"
            checked={motion}
            onChange={(event) => setMotion(event.target.checked)}
          />
          Motion
        </label>
      </div>
      <div className="petricon-filters" aria-label="Icon categories">
        {categories.map((option) => (
          <button
            type="button"
            key={option}
            aria-pressed={category === option}
            onClick={() => setCategory(option)}
          >
            {option}
          </button>
        ))}
      </div>
      <div className="petricon-workbench">
        <div>
          <div className="petricon-icon-grid">
            {visible.map((entry) => (
              <button
                type="button"
                key={entry.name}
                className="petricon-icon-tile"
                aria-label={`Inspect ${entry.label}`}
                aria-pressed={selected === entry.name}
                onClick={() => {
                  setSelected(entry.name);
                  if (window.matchMedia("(max-width: 760px)").matches) {
                    document
                      .getElementById("petricon-inspector")
                      ?.scrollIntoView({
                        behavior:
                          motion &&
                          !window.matchMedia("(prefers-reduced-motion: reduce)")
                            .matches
                            ? "smooth"
                            : "auto",
                        block: "start",
                      });
                  }
                }}
              >
                <Petricon name={entry.name} size={28} duration={420} />
                <span>{entry.label}</span>
                {entry.study && (
                  <span className="petricon-study-dot" title="Design study" />
                )}
              </button>
            ))}
          </div>
          {visible.length === 0 && (
            <p className="petricon-empty">
              No icons match “{query}”. Try a different name or category.
            </p>
          )}
          {category === "All" && !query && (
            <button
              type="button"
              className="petricon-show-all"
              onClick={() => setExpanded(!expanded)}
            >
              {expanded
                ? "Show a smaller selection"
                : `Explore all ${petriconCatalog.length} icons`}
              <span aria-hidden="true">{expanded ? "−" : "+"}</span>
            </button>
          )}
        </div>
        <Inspector key={selected} name={selected} motion={motion} />
      </div>
    </PetriconProvider>
  );
};
