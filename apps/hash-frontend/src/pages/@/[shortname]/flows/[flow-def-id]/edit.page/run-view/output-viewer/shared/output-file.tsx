import { CircularProgress } from "@mui/material";
import dynamic from "next/dynamic";
import { useState } from "react";

import { ImageWithCheckedBackground } from "@hashintel/design-system";
import { Button, Icon } from "@hashintel/ds-components";
import { css, cx } from "@hashintel/ds-helpers/css";
import { generateEntityPath } from "@local/hash-isomorphic-utils/frontend-paths";

import { useGetOwnerForEntity } from "../../../../../../../../../components/hooks/use-get-owner-for-entity";
import { getFileProperties } from "../../../../../../../../shared/get-file-properties";
import { getFilePreviewKind } from "./files";

import type { FileSteps } from "./files";
import type { HashEntity } from "@local/hash-graph-sdk/entity";

const PdfPreview = dynamic(
  () =>
    import("../../../../../../../../shared/pdf-preview").then(
      (module) => module.PdfPreview,
    ),
  { ssr: false },
);

const DocxPreview = dynamic(
  () =>
    import("../../../../../../../../shared/docx-preview").then(
      (module) => module.DocxPreview,
    ),
  { ssr: false, loading: () => <CircularProgress /> },
);

const stage = css({
  display: "flex",
  flexShrink: "0",
  justifyContent: "center",
  alignItems: "flex-start",
  p: "6",
  bg: "neutral.s20",
});
const preview = css({ position: "relative", width: "full" });
/* The previews' search, which nothing here opens. */
const noSearch = { showSearch: false, setShowSearch: () => undefined };
const unpreviewable = css({
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: "2",
  pt: "12",
  textStyle: "sm",
  color: "fg.muted",
  textAlign: "center",
  overflowWrap: "anywhere",
});
const counter = css({
  minWidth: "[52px]",
  textStyle: "sm",
  color: "fg.subtle",
  textAlign: "center",
  fontVariantNumeric: "tabular-nums",
});

/** ‹ 3 of 18 › */
export const FileNav = ({
  steps,
  variant,
  onGo,
}: {
  steps: FileSteps;
  variant: "ghost" | "subtle";
  /** Opens the file at this position in the list. */
  onGo: (index: number) => void;
}) => (
  <>
    <Button
      size="sm"
      variant={variant}
      tone="neutral"
      iconName="arrowLeft"
      aria-label="Previous file"
      tooltip="Previous · ←"
      disabled={steps.previous === null}
      onClick={() => steps.previous !== null && onGo(steps.previous)}
    />
    <span className={counter}>
      {steps.position ?? "–"} of {steps.count}
    </span>
    <Button
      size="sm"
      variant={variant}
      tone="neutral"
      iconName="arrowRight"
      aria-label="Next file"
      tooltip="Next · →"
      disabled={steps.next === null}
      onClick={() => steps.next !== null && onGo(steps.next)}
    />
  </>
);

/** Download, and the file's page in a new tab: `compact` as icons, for a header. */
export const FileActions = ({
  file,
  compact,
}: {
  file: HashEntity;
  compact: boolean;
}) => {
  const getOwnerForEntity = useGetOwnerForEntity();
  const { fileUrl } = getFileProperties(file.properties);
  const { entityId } = file.metadata.recordId;
  const { shortname } = getOwnerForEntity({ entityId });

  return (
    <>
      {fileUrl && (
        <Button
          size="sm"
          variant="subtle"
          tone="neutral"
          iconName="download"
          href={fileUrl}
          download
          {...(compact
            ? { "aria-label": "Download", tooltip: "Download" }
            : { children: "Download" })}
        />
      )}
      {/* Its owner's shortname is empty until users and orgs have loaded. */}
      {shortname && (
        <Button
          size="sm"
          variant={compact ? "subtle" : "ghost"}
          tone="neutral"
          iconName="externalLink"
          iconPosition="right"
          href={generateEntityPath({
            shortname,
            entityId,
            includeDraftId: true,
          })}
          target="_blank"
          {...(compact
            ? { "aria-label": "Open its page", tooltip: "Open its page" }
            : { children: "Open its page" })}
        />
      )}
    </>
  );
};

/** A file in HASH's file preview, on the Flows grey. */
export const FileStage = ({
  file,
  wide,
  className,
}: {
  file: HashEntity;
  /** Shows a PDF's page thumbnails, which need the room. */
  wide: boolean;
  /** Its size in what it's in. */
  className: string;
}) => {
  const { fileUrl, fileName, displayName, description } = getFileProperties(
    file.properties,
  );
  /** The Word document that couldn't be shown, which then shows by its name. */
  const [unavailableDocxUrl, setUnavailableDocxUrl] = useState<string>();
  const kind = getFilePreviewKind(file.properties);
  const name = displayName ?? fileName ?? "";

  if (!fileUrl) {
    return null;
  }

  return (
    <div className={cx(stage, className)}>
      <div className={preview}>
        {kind === "image" ? (
          <ImageWithCheckedBackground
            alt={description ?? name}
            src={fileUrl}
            /* At most its own size, as a small image blown up reads worse. */
            sx={{
              display: "block",
              width: "auto",
              maxWidth: "100%",
              mx: "auto",
            }}
          />
        ) : kind === "pdf" ? (
          <PdfPreview
            key={fileUrl}
            url={fileUrl}
            showThumbnails={wide}
            {...noSearch}
          />
        ) : kind === "docx" && unavailableDocxUrl !== fileUrl ? (
          <DocxPreview
            key={fileUrl}
            url={fileUrl}
            onUnavailable={() => setUnavailableDocxUrl(fileUrl)}
            {...noSearch}
          />
        ) : (
          <div className={unpreviewable}>
            <Icon name="file" size="lg" />
            <span>{name}</span>
            <span>This file can't be previewed. Download it to open it.</span>
          </div>
        )}
      </div>
    </div>
  );
};
