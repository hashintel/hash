import { Box, Tooltip } from "@mui/material";
import { useRef } from "react";

import { IconButton } from "@hashintel/design-system";

import { FileExportRegularIcon } from "../../../../shared/icons/file-export-regular-icon";
import { UploadRegularIcon } from "../../../../shared/icons/upload-regular-icon";

import type { SxProps, Theme } from "@mui/material";
import type { FunctionComponent } from "react";

type FilterConfigButtonsProps = {
  /** Download the current configuration (filters plus graph additions). */
  onExport: () => void;
  /** Receives the picked file's text; parsing/validation is the caller's. */
  onImport: (fileText: string) => void;
};

const configButtonSx: SxProps<Theme> = {
  p: 0.5,
  color: ({ palette }) => palette.gray[50],
  "&:hover": {
    color: ({ palette }) => palette.gray[80],
  },
  svg: { fontSize: 14 },
};

/**
 * Export/import of the full filter configuration as a file. The file exists
 * because graph additions cannot ride the URL the way filter state does
 * (entity ids are too long; see `shared/filter-config-file.ts`), so this is
 * the way to share or restore an explored view.
 */
export const FilterConfigButtons: FunctionComponent<
  FilterConfigButtonsProps
> = ({ onExport, onImport }) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 0.25 }}>
      <Tooltip title="Export filters and graph additions to a file">
        <IconButton
          size="small"
          onClick={onExport}
          aria-label="Export filters to a file"
          sx={configButtonSx}
        >
          <FileExportRegularIcon />
        </IconButton>
      </Tooltip>
      <Tooltip title="Import filters from a file">
        <IconButton
          size="small"
          onClick={() => fileInputRef.current?.click()}
          aria-label="Import filters from a file"
          sx={configButtonSx}
        >
          <UploadRegularIcon />
        </IconButton>
      </Tooltip>
      <Box
        component="input"
        ref={fileInputRef}
        type="file"
        accept="application/json,.json"
        sx={{ display: "none" }}
        onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
          const file = event.target.files?.[0];
          // Allow re-importing the same file: a file input only fires
          // `change` when the selection differs from the last one.
          if (fileInputRef.current) {
            fileInputRef.current.value = "";
          }
          if (!file) {
            return;
          }
          void file.text().then(onImport);
        }}
      />
    </Box>
  );
};
