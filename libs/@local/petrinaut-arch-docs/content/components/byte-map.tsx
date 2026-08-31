/**
 * A byte-addressed memory map: offset gutter on the left, one row per section.
 *
 * This is the diagram the hand-written HTML pages did best — reading the frame
 * format as a table loses the sense of a single contiguous buffer, which is the
 * whole point of the format. Offsets are supplied rather than computed, because
 * the map illustrates one worked example rather than a live layout.
 */

import "./diagram.css";
import { Inline } from "./inline";

export interface SegmentSpec {
  /** Byte offset where this section starts. */
  offset: number;
  name: string;
  /** Element type and count, e.g. `u32 × P`. */
  type?: string;
  /** The typed-array view used to read it. */
  view?: string;
  accent?: "core" | "worker" | "none";
}

export interface ByteMapProps {
  title?: string;
  segments: SegmentSpec[];
  /** Total length, rendered as the closing offset. */
  byteLength?: number;
  caption?: string;
}

const accentVariable = (accent: SegmentSpec["accent"]): string | undefined =>
  accent === undefined || accent === "none"
    ? undefined
    : `var(--pnd-${accent})`;

export const ByteMap = ({
  title,
  segments,
  byteLength,
  caption,
}: ByteMapProps) => (
  <figure className="pnd">
    {title === undefined ? null : (
      <figcaption className="pnd-title">{title}</figcaption>
    )}
    <div className="pnd-bytes">
      {segments.map((segment) => (
        <Segment key={segment.offset} segment={segment} />
      ))}
      {byteLength === undefined ? null : (
        <>
          <div className="pnd-offset">{byteLength}</div>
          <div />
        </>
      )}
    </div>
    {caption === undefined ? null : (
      <figcaption className="pnd-box-note" style={{ marginTop: "0.5rem" }}>
        <Inline text={caption} />
      </figcaption>
    )}
  </figure>
);

const Segment = ({ segment }: { segment: SegmentSpec }) => (
  <>
    <div className="pnd-offset">{segment.offset}</div>
    <div
      className="pnd-seg"
      style={{ ["--pnd-accent" as string]: accentVariable(segment.accent) }}
    >
      <span className="pnd-seg-name">
        <Inline text={segment.name} />
      </span>
      {segment.type === undefined ? null : (
        <span className="pnd-seg-type">
          <Inline text={segment.type} />
        </span>
      )}
      {segment.view === undefined ? null : (
        <span className="pnd-seg-view">
          <Inline text={segment.view} />
        </span>
      )}
    </div>
  </>
);
