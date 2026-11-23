import { Box } from "@mui/material";

import { Form } from "@hashintel/ds-components";

/** The white framed card every drawer section sits in */
export const SectionCard = ({ children }: { children: React.ReactNode }) => (
  <Box
    sx={{
      background: "white",
      borderRadius: "10px",
      boxShadow: "0 0 0 1px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.06)",
    }}
  >
    {children}
  </Box>
);

/**
 * A section card's field arrangement, in place of Form.Field: the header's
 * action buttons flex against the label + description block as a whole
 * (top-aligned), so their height can't stretch the label row, and the content
 * clears the header by a fixed 16px whether or not a description is present.
 */
export const DataTypeCard = ({
  label,
  description,
  actions,
  errors,
  contentGap = 2,
  children,
}: {
  label: string;
  description?: React.ReactNode;
  /** Content at the header's far edge, such as a small action Button */
  actions?: React.ReactNode;
  errors?: string[];
  /** Space between the header block and the content, in spacing units */
  contentGap?: number;
  children: React.ReactNode;
}) => (
  <Box component="section" aria-label={label}>
    <Box
      sx={{
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: 2,
      }}
    >
      {/* The margin rides the text column so a taller action button can
          overlap it instead of adding height below the header */}
      <Box sx={{ minWidth: 0, marginBottom: children ? contentGap : 0 }}>
        <Form.Field.Label as="span" size="lg">
          {label}
        </Form.Field.Label>
        {description ? (
          <Form.Field.Description>{description}</Form.Field.Description>
        ) : null}
      </Box>
      {actions ? <Box sx={{ flexShrink: 0 }}>{actions}</Box> : null}
    </Box>
    {children}
    {errors && errors.length > 0 ? (
      <Box sx={{ marginTop: 0.75 }}>
        <Form.Field.Errors errors={errors} />
      </Box>
    ) : null}
  </Box>
);
