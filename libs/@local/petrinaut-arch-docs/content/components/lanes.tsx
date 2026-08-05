/**
 * Lane-and-box diagrams: parallel columns of boxes, one column per thread or
 * mode.
 *
 * Recreates the layout the hand-written HTML architecture pages used for
 * "who owns what, on which thread". Data-driven rather than hand-marked-up, so
 * a page describes the content and the component owns the presentation.
 *
 * Portability: plain React, no dependencies beyond `react`, styles in a sibling
 * stylesheet. Nothing here assumes Astro, Starlight, or any design system, so a
 * host rendering the bundle only needs a React-capable MDX pipeline.
 */

import "./diagram.css";
import { Inline } from "./inline";

/** Accent colours, keyed to the layer families the diagrams talk about. */
export type Accent = "core" | "react" | "ui" | "worker" | "none";

const accentVariable = (accent: Accent | undefined): string | undefined =>
  accent === undefined || accent === "none"
    ? undefined
    : `var(--pnd-${accent})`;

export interface BoxSpec {
  label: string;
  note?: string;
  accent?: Accent;
}

export interface LaneSpec {
  title: string;
  accent?: Accent;
  boxes: BoxSpec[];
}

export const Box = ({ label, note, accent }: BoxSpec) => (
  <div
    className="pnd-box"
    style={{ ["--pnd-accent" as string]: accentVariable(accent) }}
  >
    <div className="pnd-box-label">
      <Inline text={label} />
    </div>
    {note === undefined ? null : (
      <div className="pnd-box-note">
        <Inline text={note} />
      </div>
    )}
  </div>
);

export interface LanesProps {
  title?: string;
  lanes: LaneSpec[];
  /** Colour key rendered beneath the lanes. */
  legend?: { label: string; accent: Accent }[];
}

export const Lanes = ({ title, lanes, legend }: LanesProps) => (
  <figure className="pnd">
    {title === undefined ? null : (
      <figcaption className="pnd-title">{title}</figcaption>
    )}
    <div
      className="pnd-lanes"
      style={{ ["--pnd-columns" as string]: String(lanes.length) }}
    >
      {lanes.map((lane) => (
        <div className="pnd-lane" key={lane.title}>
          <div className="pnd-lane-title">{lane.title}</div>
          {lane.boxes.map((box, index) => (
            <Box
              // Box labels are string, so the index is the only stable key.
              key={index}
              label={box.label}
              note={box.note}
              accent={box.accent ?? lane.accent}
            />
          ))}
        </div>
      ))}
    </div>
    {legend === undefined ? null : (
      <div className="pnd-legend">
        {legend.map((entry) => (
          <span
            key={entry.label}
            style={{ ["--pnd-accent" as string]: accentVariable(entry.accent) }}
          >
            {entry.label}
          </span>
        ))}
      </div>
    )}
  </figure>
);

export default Lanes;
