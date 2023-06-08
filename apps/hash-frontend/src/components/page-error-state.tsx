import { faArrowLeft } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@hashintel/design-system";
import { Container, Typography } from "@mui/material";

import { Link } from "../shared/ui";

export const PageErrorState = () => {
  return (
    <Container>
      <Typography mt={10} variant="h1">
        Error loading page
      </Typography>

      <Typography mt={2}>
        This page may not exist, or you may not have permission to view it.
      </Typography>

      <Link
        noLinkStyle
        href="/"
        sx={{
          mt: 4,
          display: "flex",
          alignItems: "center",
          fontWeight: 700,
          color: ({ palette }) => palette.blue[70],
        }}
      >
        <FontAwesomeIcon icon={faArrowLeft} sx={{ mr: 1 }} />
        Return Home
      </Link>
    </Container>
  );
};
