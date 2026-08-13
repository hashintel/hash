/**
 * A two-actor message sequence: who sends what, in order, with side notes.
 *
 * Kept to two actors deliberately. The hand-written HTML had three columns
 * (host, main-thread runtime, worker), which read as three lifelines but made
 * every message ambiguous about which hop it described. Two actors and an
 * explicit direction says the same thing without the ambiguity.
 */

import "./diagram.css";
import { Inline } from "./inline";

export interface MessageSpec {
  /** `right` is left-actor → right-actor. */
  direction: "right" | "left";
  label: string;
  note?: string;
}

/** A phase separator, rendered as a full-width note rather than a message. */
export interface PhaseSpec {
  phase: string;
}

export type SequenceRow = MessageSpec | PhaseSpec;

export interface SequenceProps {
  title?: string;
  actors: [string, string];
  rows: SequenceRow[];
}

const isPhase = (row: SequenceRow): row is PhaseSpec => "phase" in row;

export const Sequence = ({ title, actors, rows }: SequenceProps) => (
  <figure className="pnd">
    {title === undefined ? null : (
      <figcaption className="pnd-title">{title}</figcaption>
    )}
    <div className="pnd-actors">
      <span>{actors[0]}</span>
      <span aria-hidden="true" />
      <span>{actors[1]}</span>
    </div>
    <div className="pnd-sequence">
      {rows.map((row, index) =>
        isPhase(row) ? (
          <div className="pnd-msg-note" key={index}>
            <Inline text={row.phase} />
          </div>
        ) : (
          /*
           * The direction arrow is decorative, so a screen reader would
           * otherwise get the label with no indication of who sent it. The
           * visually-hidden sentence carries that, and is the only place
           * direction is stated in text.
           */
          <div className="pnd-msg" key={index}>
            <span className="pnd-sr-only">
              {row.direction === "right"
                ? `${actors[0]} to ${actors[1]}: `
                : `${actors[1]} to ${actors[0]}: `}
            </span>
            {row.direction === "right" ? (
              <>
                <div className="pnd-msg-label">
                  <Inline text={row.label} />
                </div>
                <div aria-hidden="true" className="pnd-msg-dir">
                  →
                </div>
                <div className="pnd-msg-note">
                  {row.note === undefined ? null : <Inline text={row.note} />}
                </div>
              </>
            ) : (
              <>
                <div className="pnd-msg-note">
                  {row.note === undefined ? null : <Inline text={row.note} />}
                </div>
                <div aria-hidden="true" className="pnd-msg-dir">
                  ←
                </div>
                <div className="pnd-msg-label">
                  <Inline text={row.label} />
                </div>
              </>
            )}
          </div>
        ),
      )}
    </div>
  </figure>
);
