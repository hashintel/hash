import { useState } from "preact/hooks";

import type { DropKind } from "../../app-controller.ts";

export const DropZone = ({
  kind,
  label,
  filename,
  accept,
  multiple = false,
  onFiles,
}: {
  kind: DropKind;
  label: string;
  filename: string;
  accept: string;
  multiple?: boolean;
  onFiles: (files: readonly File[]) => void;
}) => {
  const [isDragging, setIsDragging] = useState(false);
  return (
    <label
      class={[
        "drop-zone",
        filename ? "has-file" : "",
        isDragging ? "is-dragging" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      data-drop-kind={kind}
      onDragOver={(event) => {
        event.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setIsDragging(false);
        onFiles(event.dataTransfer ? [...event.dataTransfer.files] : []);
      }}
    >
      <input
        type="file"
        accept={accept}
        multiple={multiple}
        onChange={(event) => {
          onFiles(
            event.currentTarget.files ? [...event.currentTarget.files] : [],
          );
        }}
      />
      <span class="drop-icon" aria-hidden="true">
        {filename ? "✓" : "↓"}
      </span>
      <strong>{filename || label}</strong>
      <span>
        {filename
          ? "Loaded · choose another file to replace"
          : "Drop here or choose a file"}
      </span>
    </label>
  );
};
