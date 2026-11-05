/**
 * `?filetypes=1` (inbox outputs-viewer, open): every kind of file a step can output, not only PDFs and emails —
 * images, video, audio, slides, text and data, archives, links and unknown types — on the Fetch certificate step as
 * one mixed list. Dora's hybrid (Slack #design, 5 Nov): a small preview in the right panel that pops out to a larger
 * viewer. The DS has no video, audio, slides, archive or link icon (logged in ds-gaps-flows.md), so those borrow
 * `play`, `file`, `fileLines`, `externalLink`.
 */
import { useState } from "react";

import { Icon, type IconName } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

export const useFileTypes = () =>
  new URLSearchParams(globalThis.location.search).get("filetypes") === "1";

type Base = { id: string; name: string; sizeKb: number };

export type MediaFile =
  | (Base & { kind: "image"; format: "JPG" | "PNG" | "SVG"; width: number; height: number; scene: "site" | "scan" | "screen" | "logo" })
  | (Base & { kind: "video"; format: "MP4" | "MOV"; duration: string; width: number; height: number })
  | (Base & { kind: "audio"; format: "M4A" | "MP3"; duration: string })
  | (Base & { kind: "slides"; format: "PPTX" | "KEY"; pages: number; title: string })
  | (Base & { kind: "text"; format: "MD" | "JSON" | "TXT"; lines: string[] })
  | (Base & { kind: "archive"; format: "ZIP"; entries: { name: string; kb: number }[] })
  | (Base & { kind: "link"; url: string; title: string; domain: string })
  | (Base & { kind: "unknown"; format: string });

/** Seeded: what Fetch certificate gathered for Halden Chemicals in Run 16. */
export const mediaFiles: MediaFile[] = [
  { id: "scan", kind: "image", format: "JPG", name: "halden-chemicals_iso-9001_scan.jpg", sizeKb: 842, width: 2480, height: 3508, scene: "scan" },
  { id: "site", kind: "image", format: "JPG", name: "halden-site_loading-bay.jpg", sizeKb: 2310, width: 4032, height: 3024, scene: "site" },
  { id: "portal", kind: "image", format: "PNG", name: "supplier-portal_status.png", sizeKb: 418, width: 1440, height: 900, scene: "screen" },
  { id: "logo", kind: "image", format: "SVG", name: "halden-logo.svg", sizeKb: 6, width: 240, height: 64, scene: "logo" },
  { id: "video", kind: "video", format: "MP4", name: "warehouse-inspection_2-nov.mp4", sizeKb: 48200, duration: "2:14", width: 1920, height: 1080 },
  { id: "audio", kind: "audio", format: "M4A", name: "auditor-voice-note.m4a", sizeKb: 1260, duration: "0:48" },
  { id: "slides", kind: "slides", format: "PPTX", name: "q3-quality-review.pptx", sizeKb: 5120, pages: 14, title: "Q3 quality review · Halden Chemicals" },
  { id: "notes", kind: "text", format: "MD", name: "audit-notes.md", sizeKb: 3, lines: ["# Audit notes · 2 Nov", "", "- Loading bay signage updated", "- Two pallets without batch labels", "- Next audit due **Feb 2027**"] },
  { id: "json", kind: "text", format: "JSON", name: "certificate.json", sizeKb: 1, lines: ["{", '  "certNo": "QA 21/14271",', '  "issuer": "Bureau Veritas",', '  "validUntil": "9 Aug 2027"', "}"] },
  { id: "zip", kind: "archive", format: "ZIP", name: "msds-sheets.zip", sizeKb: 3940, entries: [{ name: "msds_acetone.pdf", kb: 612 }, { name: "msds_ethanol.pdf", kb: 588 }, { name: "msds_toluene.pdf", kb: 640 }, { name: "readme.txt", kb: 2 }] },
  { id: "link", kind: "link", name: "Supplier registry entry", sizeKb: 0, url: "https://registry.example.org/suppliers/halden", title: "Halden Chemicals · Supplier registry", domain: "registry.example.org" },
  { id: "dwg", kind: "unknown", format: "DWG", name: "site-plan_rev4.dwg", sizeKb: 7420 },
];

const sizeText = (kb: number) =>
  kb >= 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${kb} KB`;

const metaOf = (file: MediaFile) => {
  switch (file.kind) {
    case "image":
      return `${file.format} · ${file.width} × ${file.height} · ${sizeText(file.sizeKb)}`;
    case "video":
      return `${file.format} · ${file.duration} · ${file.width} × ${file.height} · ${sizeText(file.sizeKb)}`;
    case "audio":
      return `${file.format} · ${file.duration} · ${sizeText(file.sizeKb)}`;
    case "slides":
      return `${file.format} · ${file.pages} slides · ${sizeText(file.sizeKb)}`;
    case "text":
      return `${file.format} · ${file.lines.length} lines · ${sizeText(file.sizeKb)}`;
    case "archive":
      return `${file.format} · ${file.entries.length} files · ${sizeText(file.sizeKb)}`;
    case "link":
      return file.domain;
    case "unknown":
      return `${file.format} · ${sizeText(file.sizeKb)} · no preview`;
  }
};

const iconOf = (file: MediaFile): IconName => {
  switch (file.kind) {
    case "image":
      return "image";
    case "video":
      return "play";
    case "text":
      return file.format === "JSON" ? "code" : "fileLines";
    case "link":
      return "externalLink";
    case "slides":
      return "fileLines";
    default:
      return "file";
  }
};

/** A drawn stand-in for each picture, in DS neutrals, so nothing loads from the network. */
const sceneStyle: Record<"site" | "scan" | "screen" | "logo", string> = {
  site: "linear-gradient(180deg, var(--colors-neutral-s30) 0 45%, var(--colors-neutral-s60) 45% 62%, var(--colors-neutral-s40) 62% 100%)",
  scan: "repeating-linear-gradient(180deg, var(--colors-neutral-s00) 0 9%, var(--colors-neutral-s30) 9% 10.5%), var(--colors-neutral-s00)",
  screen: "linear-gradient(90deg, var(--colors-neutral-s30) 0 22%, var(--colors-neutral-s10) 22% 100%)",
  logo: "radial-gradient(circle at 30% 50%, var(--colors-neutral-s90) 0 14%, transparent 15%), var(--colors-neutral-s10)",
};

const thumbStyle = css({
  flexShrink: 0,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: "[32px]",
  height: "[32px]",
  borderRadius: "md",
  backgroundColor: "neutral.s15",
  color: "neutral.fg.subtle",
  overflow: "hidden",
  position: "relative",
  borderWidth: "thin",
  borderStyle: "solid",
  borderColor: "neutral.bd.subtle",
});

const Thumb = ({ file }: { file: MediaFile }) => {
  if (file.kind === "image") {
    return <span className={thumbStyle} style={{ background: sceneStyle[file.scene] }} />;
  }
  if (file.kind === "video") {
    return (
      <span className={thumbStyle} style={{ background: sceneStyle.site }}>
        <span className={css({ display: "inline-flex", width: "[14px]", height: "[14px]", borderRadius: "full", alignItems: "center", justifyContent: "center", backgroundColor: "[rgb(0 0 0 / 0.55)]", color: "[white]" })}>
          <Icon name="playFilled" size="xs" />
        </span>
      </span>
    );
  }
  return (
    <span className={thumbStyle}>
      <Icon name={iconOf(file)} size="sm" />
    </span>
  );
};

const rowStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "2.5",
  width: "[100%]",
  minHeight: "[44px]",
  paddingX: "2",
  border: "none",
  borderRadius: "md",
  background: "[transparent]",
  textAlign: "left",
  cursor: "pointer",
  _hover: { backgroundColor: "neutral.bg.surface.hover" },
  "&[data-selected]": { backgroundColor: "neutral.s20" },
});

const nameStyle = css({ textStyle: "sm", color: "neutral.fg.heading", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" });
const metaStyle = css({ textStyle: "xs", color: "neutral.fg.subtle", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" });

const Waveform = ({ bars, height }: { bars: number; height: number }) => (
  <span className={css({ display: "flex", alignItems: "center", gap: "[2px]", flex: "1" })} style={{ height }}>
    {Array.from({ length: bars }, (_, i) => (
      <span
        key={i}
        className={css({ flex: "1", borderRadius: "[1px]", backgroundColor: "neutral.s60" })}
        style={{ height: `${20 + ((i * 37) % 70)}%` }}
      />
    ))}
  </span>
);

const codeStyle = css({
  margin: "[0]",
  padding: "3",
  borderRadius: "md",
  backgroundColor: "neutral.s10",
  borderWidth: "thin",
  borderStyle: "solid",
  borderColor: "neutral.bd.subtle",
  fontFamily: "mono",
  textStyle: "xs",
  color: "neutral.fg.body",
  whiteSpace: "pre",
  overflow: "hidden",
});

/** The file itself, filling its box: small in the right panel, large in the pop-out. */
const Preview = ({ file, large, zoom = 1 }: { file: MediaFile; large: boolean; zoom?: number }) => {
  const frame = css({ position: "relative", width: "[100%]", borderRadius: "md", overflow: "hidden", borderWidth: "thin", borderStyle: "solid", borderColor: "neutral.bd.subtle", backgroundColor: "neutral.s10" });
  switch (file.kind) {
    case "image":
      return (
        <div className={frame} style={{ aspectRatio: `${file.width} / ${file.height}`, maxHeight: large ? 520 : 220 }}>
          <div style={{ position: "absolute", inset: 0, background: sceneStyle[file.scene], transform: `scale(${zoom})`, transformOrigin: "center" }} />
        </div>
      );
    case "video":
      return (
        <div className={frame} style={{ aspectRatio: "16 / 9" }}>
          <div style={{ position: "absolute", inset: 0, background: sceneStyle.site }} />
          <span className={css({ position: "absolute", inset: "[0]", display: "flex", alignItems: "center", justifyContent: "center" })}>
            <span className={css({ display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: "full", backgroundColor: "[rgb(0 0 0 / 0.55)]", color: "[white]" })} style={{ width: large ? 56 : 36, height: large ? 56 : 36 }}>
              <Icon name="playFilled" size={large ? "md" : "sm"} />
            </span>
          </span>
          <span className={css({ position: "absolute", right: "2", bottom: "2", paddingX: "1.5", borderRadius: "sm", backgroundColor: "[rgb(0 0 0 / 0.55)]", color: "[white]", textStyle: "xs" })}>
            {file.duration}
          </span>
        </div>
      );
    case "audio":
      return (
        <div className={`${frame} ${css({ display: "flex", alignItems: "center", gap: "3", padding: "3" })}`}>
          <Icon name="playFilled" size="sm" />
          <Waveform bars={large ? 72 : 36} height={large ? 64 : 32} />
          <span className={metaStyle}>{file.duration}</span>
        </div>
      );
    case "slides":
      return (
        <div className={frame} style={{ aspectRatio: "16 / 9" }}>
          <div className={css({ position: "absolute", inset: "[12%]", display: "flex", flexDirection: "column", justifyContent: "center", gap: "2" })}>
            <span className={css({ textStyle: large ? "xl" : "sm", fontWeight: "medium", color: "neutral.fg.heading" })}>{file.title}</span>
            <span className={css({ height: "[2px]", width: "[40%]", backgroundColor: "neutral.s40" })} />
          </div>
          <span className={css({ position: "absolute", right: "2", bottom: "2", textStyle: "xs", color: "neutral.fg.subtle" })}>1 / {file.pages}</span>
        </div>
      );
    case "text":
      return <pre className={codeStyle}>{(large ? file.lines : file.lines.slice(0, 5)).join("\n")}</pre>;
    case "archive":
      return (
        <div className={`${frame} ${css({ padding: "1" })}`}>
          {file.entries.map((entry) => (
            <div key={entry.name} className={css({ display: "flex", alignItems: "center", gap: "2", height: "[28px]", paddingX: "2", textStyle: "xs", color: "neutral.fg.body" })}>
              <Icon name="file" size="xs" />
              <span className={css({ flex: "1" })}>{entry.name}</span>
              <span className={metaStyle}>{sizeText(entry.kb)}</span>
            </div>
          ))}
        </div>
      );
    case "link":
      return (
        <div className={`${frame} ${css({ display: "flex", alignItems: "center", gap: "3", padding: "3", backgroundColor: "neutral.s00" })}`}>
          <span className={css({ display: "inline-flex", width: "[24px]", height: "[24px]", borderRadius: "sm", backgroundColor: "neutral.s20", alignItems: "center", justifyContent: "center", textStyle: "xs", fontWeight: "medium", color: "neutral.fg.muted" })}>R</span>
          <span className={css({ display: "flex", flexDirection: "column", minWidth: "[0]" })}>
            <span className={nameStyle}>{file.title}</span>
            <span className={metaStyle}>{file.domain}</span>
          </span>
        </div>
      );
    case "unknown":
      return (
        <div className={`${frame} ${css({ display: "flex", flexDirection: "column", alignItems: "center", gap: "2", padding: "5", color: "neutral.fg.subtle" })}`}>
          <Icon name="file" size="md" />
          <span className={nameStyle}>{file.name}</span>
          <span className={metaStyle}>{sizeText(file.sizeKb)} · no preview for .{file.format.toLowerCase()}</span>
          <button type="button" className={ghostStyle}>
            <Icon name="download" size="sm" />
            Download
          </button>
        </div>
      );
  }
};

const ghostStyle = css({
  display: "inline-flex",
  alignItems: "center",
  gap: "1.5",
  height: "[28px]",
  paddingX: "2",
  borderWidth: "thin",
  borderStyle: "solid",
  borderColor: "neutral.bd.subtle",
  borderRadius: "md",
  backgroundColor: "neutral.s00",
  cursor: "pointer",
  textStyle: "sm",
  color: "neutral.fg.body",
  _hover: { backgroundColor: "neutral.bg.surface.hover" },
});

const iconButtonStyle = css({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: "[28px]",
  height: "[28px]",
  border: "none",
  borderRadius: "md",
  background: "[transparent]",
  cursor: "pointer",
  color: "neutral.fg.muted",
  _hover: { backgroundColor: "neutral.bg.surface.hover", color: "neutral.fg.heading" },
});

/** The pop-out: the same file, large, with zoom for images and play for video. */
const PopOut = ({ file, onClose }: { file: MediaFile; onClose: () => void }) => {
  const [zoom, setZoom] = useState(1);
  return (
    <div
      data-file-popout
      className={css({ position: "fixed", inset: "[0]", zIndex: "[60]", display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "[rgb(0 0 0 / 0.32)]" })}
      onClick={onClose}
      onKeyDown={(event) => event.key === "Escape" && onClose()}
      role="presentation"
    >
      <div
        role="dialog"
        aria-label={file.name}
        className={css({ width: "[min(880px, 90vw)]", maxHeight: "[90vh]", overflow: "auto", padding: "4", borderRadius: "xl", backgroundColor: "neutral.s00", boxShadow: "[0 12px 40px rgb(0 0 0 / 0.18)]" })}
        onClick={(event) => event.stopPropagation()}
      >
        <div className={css({ display: "flex", alignItems: "center", gap: "2", marginBottom: "3" })}>
          <Thumb file={file} />
          <span className={css({ display: "flex", flexDirection: "column", flex: "1", minWidth: "[0]" })}>
            <span className={nameStyle}>{file.name}</span>
            <span className={metaStyle}>{metaOf(file)}</span>
          </span>
          {file.kind === "image" ? (
            <>
              <button type="button" className={iconButtonStyle} aria-label="Zoom out" onClick={() => setZoom((z) => Math.max(1, z - 0.5))}>
                <Icon name="zoomOut" size="sm" />
              </button>
              <span className={metaStyle}>{Math.round(zoom * 100)}%</span>
              <button type="button" className={iconButtonStyle} aria-label="Zoom in" onClick={() => setZoom((z) => Math.min(3, z + 0.5))}>
                <Icon name="zoomIn" size="sm" />
              </button>
            </>
          ) : null}
          <button type="button" className={iconButtonStyle} aria-label="Download">
            <Icon name="download" size="sm" />
          </button>
          <button type="button" className={iconButtonStyle} aria-label="Close" onClick={onClose}>
            <Icon name="close" size="sm" />
          </button>
        </div>
        <Preview file={file} large zoom={zoom} />
      </div>
    </div>
  );
};

/** The Fetch certificate step's outputs as one mixed list, with Dora's hybrid: preview here, pop out for more. */
export const MixedFileOutputs = () => {
  const [selected, setSelected] = useState<string>("site");
  const [popped, setPopped] = useState<string | null>(null);
  const file = mediaFiles.find((entry) => entry.id === selected);
  const poppedFile = mediaFiles.find((entry) => entry.id === popped);
  return (
    <div data-mixed-file-outputs className={css({ display: "flex", flexDirection: "column", gap: "3" })}>
      <div className={css({ display: "flex", alignItems: "baseline", gap: "2" })}>
        <span className={css({ textStyle: "sm", fontWeight: "medium", color: "neutral.fg.heading" })}>Files</span>
        <span className={metaStyle}>{mediaFiles.length} · Halden Chemicals</span>
      </div>
      {file ? (
        <div className={css({ display: "flex", flexDirection: "column", gap: "2" })} data-file-preview>
          <Preview file={file} large={false} />
          <div className={css({ display: "flex", alignItems: "center", gap: "2" })}>
            <span className={css({ display: "flex", flexDirection: "column", flex: "1", minWidth: "[0]" })}>
              <span className={nameStyle}>{file.name}</span>
              <span className={metaStyle}>{metaOf(file)}</span>
            </span>
            <button type="button" className={ghostStyle} onClick={() => setPopped(file.id)} data-pop-out>
              <Icon name="expand" size="sm" />
              Pop out
            </button>
          </div>
        </div>
      ) : null}
      <div className={css({ display: "flex", flexDirection: "column" })}>
        {mediaFiles.map((entry) => (
          <button
            key={entry.id}
            type="button"
            className={rowStyle}
            data-selected={entry.id === selected || undefined}
            data-file-row={entry.kind}
            onClick={() => setSelected(entry.id)}
            onDoubleClick={() => setPopped(entry.id)}
          >
            <Thumb file={entry} />
            <span className={css({ display: "flex", flexDirection: "column", minWidth: "[0]", flex: "1" })}>
              <span className={nameStyle}>{entry.name}</span>
              <span className={metaStyle}>{metaOf(entry)}</span>
            </span>
          </button>
        ))}
      </div>
      {poppedFile ? <PopOut file={poppedFile} onClose={() => setPopped(null)} /> : null}
    </div>
  );
};
