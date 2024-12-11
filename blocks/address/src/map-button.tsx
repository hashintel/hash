import type { ButtonProps } from "@hashintel/design-system";
import { Button } from "@hashintel/design-system";
// @todo: https://linear.app/hash/issue/H-3769/investigate-new-eslint-errors
// eslint-disable-next-line no-restricted-imports
import { Link } from "@mui/material";

export const MapButton = ({ children, href, sx, ...props }: ButtonProps) => {
  return (
    <Link
      href={href}
      sx={{
        textDecoration: "none !important",
      }}
    >
      <Button
        {...props}
        variant="tertiary_quiet"
        sx={[
          ({ palette }) => ({
            height: 42,
            fontWeight: 500,
            fontSize: 14,
            lineHeight: "18px",
            color: palette.gray[80],
            border: `1px solid ${palette.gray[30]}`,
            whiteSpace: "nowrap",
            textTransform: "none",
            paddingY: 1.5,
            paddingX: 2.5,
          }),
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- TODO why is this inferred as any?
          ...(Array.isArray(sx) ? sx : [sx]),
        ]}
      >
        {children}
      </Button>
    </Link>
  );
};
