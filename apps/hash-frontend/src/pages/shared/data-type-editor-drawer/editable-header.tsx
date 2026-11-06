import { Box, Typography } from "@mui/material";

import { parseUrlForOntologyChip } from "@hashintel/design-system";
import { Chip, Icon } from "@hashintel/ds-components";

import type { VersionedUrl } from "@blockprotocol/type-system";

/**
 * The edit-mode drawer header: the owning web, the type's name and
 * description shown as a full-width heading, and the type's URL as a chip.
 * There is no display/edit swap — each field is an always-mounted bare
 * textarea overlaid on a hidden mirror that sizes it to its content, so
 * focusing or typing cannot shift the layout. The ds scoped preflight
 * restyles inputs with boosted specificity, hence the !important.
 */
const titleMetrics = {
  fontFamily: "inherit",
  fontSize: "27px",
  fontWeight: 600,
  lineHeight: "34px",
  letterSpacing: "inherit",
  color: "#262626",
} as const;

const descriptionMetrics = {
  fontFamily: "inherit",
  fontSize: "14px",
  fontWeight: 400,
  lineHeight: "21px",
  letterSpacing: "inherit",
  color: "#525252",
} as const;

const important = (styles: Record<string, string | number>) =>
  Object.fromEntries(
    Object.entries(styles).map(([key, value]) => [key, `${value} !important`]),
  );

const rowSx = {
  display: "flex",
  alignItems: "center",
  gap: 1,
  maxWidth: "100%",
  cursor: "text",
  "& .edit-icon": {
    opacity: 0,
    transition: "opacity 120ms",
    display: "inline-flex",
    color: "#8d8d8d",
    flexShrink: 0,
  },
  "&:hover .edit-icon": { opacity: 1 },
  "&:focus-within .edit-icon": { opacity: 0 },
} as const;

const cellSx = {
  display: "inline-grid",
  minWidth: 0,
  maxWidth: "100%",
} as const;

const mirrorSx = {
  gridArea: "1 / 1",
  visibility: "hidden",
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
  // Caret room when the caret sits at the end of the text
  paddingRight: "2px",
} as const;

const fieldResetSx = {
  gridArea: "1 / 1",
  width: "100%",
  minWidth: 0,
  height: "100%",
  display: "block",
  margin: "0 !important",
  padding: "0 !important",
  border: "none !important",
  outline: "none !important",
  background: "transparent !important",
  boxShadow: "none !important",
  borderRadius: 0,
  resize: "none !important",
  overflow: "hidden !important",
  wordBreak: "break-word",
  "&::placeholder": { color: "#a3a3a3 !important", opacity: "1 !important" },
} as const;

const fieldErrorSx = {
  fontSize: 13,
  marginTop: 0.5,
  color: "#d32f2f",
} as const;

const preventNewline = (event: React.KeyboardEvent) => {
  if (event.key === "Enter") {
    event.preventDefault();
  }
};

const ontologyPathPattern = /(@[\w-]+)(\/[^/]+\/[^/]*)?(?:\/([\w-]+))?(\/.*)?/;

const UrlChip = ({ url }: { url: VersionedUrl }) => {
  const { domain, path } = parseUrlForOntologyChip(url);
  const match = path.match(ontologyPathPattern);
  const [, shortname, between, slug, after] = match ?? [];

  return (
    <Chip
      size="md"
      variant="soft"
      color="grey"
      prefix={{
        variant: "angle",
        children: domain,
      }}
    >
      <Box component="span" sx={{ color: ({ palette }) => palette.blue[70] }}>
        {shortname ? (
          <>
            <Box component="span" sx={{ fontWeight: 700 }}>
              {shortname}
            </Box>
            {(between ?? slug) ? `${between ?? ""}${slug ? "/" : ""}` : null}
            {slug ? (
              <Box component="span" sx={{ fontWeight: 700 }}>
                {slug}
              </Box>
            ) : null}
            {after ?? null}
          </>
        ) : (
          path
        )}
      </Box>
    </Chip>
  );
};

export const EditableHeader = ({
  webShortname,
  dataTypeUrl,
  title,
  description,
  onTitleChange,
  onDescriptionChange,
  titleError,
  descriptionError,
  readonly,
}: {
  webShortname?: string;
  dataTypeUrl: VersionedUrl;
  title: string;
  description: string;
  onTitleChange: (title: string) => void;
  onDescriptionChange: (description: string) => void;
  titleError?: string;
  descriptionError?: string;
  readonly?: boolean;
}) => (
  <Box sx={{ padding: "2px 0 5px" }}>
    {webShortname ? (
      <Typography
        sx={{
          fontSize: "13px !important",
          lineHeight: "18px !important",
          fontWeight: "500 !important",
          color: "#737373 !important",
          marginTop: "4px",
          marginBottom: "2px",
        }}
      >
        @{webShortname}
      </Typography>
    ) : null}

    <Box
      component="label"
      sx={{ ...rowSx, marginTop: webShortname ? 0 : "14px" }}
    >
      <Box sx={cellSx}>
        <Box
          component="span"
          aria-hidden
          sx={{ ...important(titleMetrics), ...mirrorSx }}
        >
          {/* The trailing space keeps the mirror one step ahead of the caret */}
          {`${title || "Data type name"} `}
        </Box>
        <Box
          component="textarea"
          value={title}
          readOnly={readonly}
          onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) =>
            onTitleChange(event.target.value.replace(/\n/g, ""))
          }
          onKeyDown={preventNewline}
          placeholder="Data type name"
          aria-label="Data type name"
          rows={1}
          cols={1}
          data-no-autofocus=""
          sx={{ ...fieldResetSx, ...important(titleMetrics) }}
        />
      </Box>
      {readonly ? null : (
        <Box className="edit-icon">
          <Icon name="pencil" size="sm" />
        </Box>
      )}
    </Box>
    {titleError ? (
      <Typography sx={fieldErrorSx}>{titleError}</Typography>
    ) : null}

    <Box component="label" sx={{ ...rowSx, marginTop: 0.75 }}>
      <Box sx={cellSx}>
        <Box
          component="span"
          aria-hidden
          sx={{ ...important(descriptionMetrics), ...mirrorSx }}
        >
          {`${description || "Add a description…"} `}
        </Box>
        <Box
          component="textarea"
          value={description}
          readOnly={readonly}
          onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) =>
            onDescriptionChange(event.target.value)
          }
          placeholder="Add a description…"
          aria-label="Description"
          rows={1}
          cols={1}
          data-no-autofocus=""
          sx={{ ...fieldResetSx, ...important(descriptionMetrics) }}
        />
      </Box>
      {readonly ? null : (
        <Box className="edit-icon">
          <Icon name="pencil" size="xs" />
        </Box>
      )}
    </Box>
    {descriptionError ? (
      <Typography sx={fieldErrorSx}>{descriptionError}</Typography>
    ) : null}

    <Box sx={{ marginTop: "12px" }}>
      <UrlChip url={dataTypeUrl} />
    </Box>
  </Box>
);
