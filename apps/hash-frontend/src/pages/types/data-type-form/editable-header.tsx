import { Box, Typography } from "@mui/material";

import { Icon } from "@hashintel/ds-components";

/**
 * The edit-mode drawer header: the type's name and description shown as a
 * full-width heading. There is no display/edit swap — each field is an
 * always-mounted bare textarea overlaid on a hidden mirror that sizes it to
 * its content, so focusing or typing cannot shift the layout. The ds scoped
 * preflight restyles inputs with boosted specificity, hence the !important.
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

const pluralMetrics = {
  fontFamily: "inherit",
  fontSize: "13px",
  fontWeight: 500,
  lineHeight: "20px",
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

export const EditableHeader = ({
  title,
  titlePlural,
  description,
  onTitleChange,
  onTitlePluralChange,
  onDescriptionChange,
  titleError,
  descriptionError,
  readonly,
  actions,
}: {
  title: string;
  titlePlural: string;
  description: string;
  onTitleChange: (title: string) => void;
  onTitlePluralChange: (titlePlural: string) => void;
  onDescriptionChange: (description: string) => void;
  titleError?: string;
  descriptionError?: string;
  readonly?: boolean;
  /** Rendered beside the description, at the row's far edge */
  actions?: React.ReactNode;
}) => (
  // 1px + the drawer header's own 14px puts the content 16px off the bottom
  // border, mirroring the 16px between the breadcrumb row and the title
  <Box sx={{ padding: "2px 0 1px" }}>
    {readonly ? (
      // Plain text: a read-only textarea still takes a caret on click. The
      // !important beats the ds scoped preflight's boosted heading rules.
      <Box
        component="h2"
        sx={{
          ...important({ ...titleMetrics, margin: 0, marginTop: "14px" }),
          overflowWrap: "break-word",
        }}
      >
        {title}
      </Box>
    ) : (
      <Box component="label" sx={{ ...rowSx, marginTop: "14px" }}>
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
        <Box className="edit-icon">
          <Icon name="pencil" size="sm" />
        </Box>
      </Box>
    )}
    {titleError ? (
      <Typography sx={fieldErrorSx}>{titleError}</Typography>
    ) : null}

    {/* Always shown: an unset plural displays the singular as its stand-in */}
    <Box
      component={readonly ? "div" : "label"}
      sx={{
        ...rowSx,
        // Baseline keeps the small-caps label level with the larger value
        alignItems: "baseline",
        "& .edit-icon": { ...rowSx["& .edit-icon"], alignSelf: "center" },
        gap: 0.75,
        marginTop: "2px",
        ...(readonly ? { cursor: "default" } : {}),
      }}
    >
      <Typography
        component="span"
        sx={{
          fontSize: 10.5,
          fontWeight: 600,
          letterSpacing: "0.05em",
          textTransform: "uppercase",
          color: "#8d8d8d",
          flexShrink: 0,
        }}
      >
        Plural
      </Typography>
      {readonly ? (
        <Box
          component="span"
          sx={important({
            ...pluralMetrics,
            // The singular stand-in keeps placeholder styling, so a set
            // plural stays tellable from the fallback
            ...(titlePlural.trim() ? {} : { color: "#a3a3a3" }),
          })}
        >
          {titlePlural.trim() || title}
        </Box>
      ) : (
        <>
          <Box sx={cellSx}>
            <Box
              component="span"
              aria-hidden
              sx={{ ...important(pluralMetrics), ...mirrorSx }}
            >
              {/* Unset falls back to the singular name, shown as the placeholder */}
              {`${titlePlural || title || "The plural form"} `}
            </Box>
            <Box
              component="textarea"
              value={titlePlural}
              onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) =>
                onTitlePluralChange(event.target.value.replace(/\n/g, ""))
              }
              onKeyDown={preventNewline}
              placeholder={title || "The plural form"}
              aria-label="Plural name"
              rows={1}
              cols={1}
              data-no-autofocus=""
              sx={{ ...fieldResetSx, ...important(pluralMetrics) }}
            />
          </Box>
          <Box className="edit-icon">
            <Icon name="pencil" size="xs" />
          </Box>
        </>
      )}
    </Box>

    {!readonly || description || actions ? (
      <Box
        sx={{
          display: "flex",
          alignItems: "flex-start",
          gap: 2,
          // A step up from the title + plural cluster's 2px, so the
          // description reads as its own block
          marginTop: "10px",
        }}
      >
        <Box sx={{ flex: 1, minWidth: 0 }}>
          {readonly ? (
            description ? (
              <Box
                component="p"
                sx={{
                  ...important({ ...descriptionMetrics, margin: 0 }),
                  overflowWrap: "break-word",
                }}
              >
                {description}
              </Box>
            ) : null
          ) : (
            <Box component="label" sx={rowSx}>
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
              <Box className="edit-icon">
                <Icon name="pencil" size="xs" />
              </Box>
            </Box>
          )}
        </Box>
        {actions ? (
          // Bottom-aligned, centred on the last description line; the
          // negative margins keep the ghost button's 28px box from
          // stretching the row past a 21px text line, so edit and readonly
          // headers match heights
          <Box
            sx={{
              flexShrink: 0,
              alignSelf: "flex-end",
              marginTop: "-4px",
              marginBottom: "-3px",
            }}
          >
            {actions}
          </Box>
        ) : null}
      </Box>
    ) : null}
    {descriptionError ? (
      <Typography sx={fieldErrorSx}>{descriptionError}</Typography>
    ) : null}
  </Box>
);
