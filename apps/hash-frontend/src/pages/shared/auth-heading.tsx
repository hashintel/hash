import { styled, Typography, TypographyProps } from "@mui/material";
import { Inter } from "next/font/google";
/**
 * @todo: figure out how to make this re-usable in the theme, if it is
 * needed elsewhere.
 */
const interFont = Inter({
  weight: ["900"],
  subsets: ["latin-ext"],
});

export const AuthHeading = styled((props: TypographyProps) => (
  <Typography variant="h1" {...props} />
))(({ theme }) => ({
  marginBottom: theme.spacing(4.25),
  color: theme.palette.common.black,
  fontSize: 26,
  textTransform: "uppercase",
  fontFamily: interFont.style.fontFamily,
  fontWeight: interFont.style.fontWeight,
}));
