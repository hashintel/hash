import { Container, Typography } from "@mui/material";
import type { ErrorProps } from "next/error";

import { Link } from "../components/link";
import { PageLayout } from "../components/page-layout";
import type { NextPageWithLayout } from "../util/next-types";
import { BlueStylishDivider } from "./blog/shared/blue-styled-divider";

const NotFoundPage: NextPageWithLayout<ErrorProps> = () => {
  return (
    <Container>
      <Typography gutterBottom variant="hashHeading4">
        We’re sorry...
      </Typography>
      <Typography marginBottom={5} variant="hashLargeTitle">
        This page could not be displayed
      </Typography>
      <BlueStylishDivider mb={5} />
      <Typography marginBottom={4}>
        The page you’re trying to access may have moved, the URL may be
        incorrect, or you might lack permission to view this page.
      </Typography>
      <Typography>
        <Link href="/">
          <strong>Click here to return home</strong>
        </Link>{" "}
        {/* or use the search bar below to find what you’re looking for: */}
      </Typography>
    </Container>
  );
};

NotFoundPage.getLayout = (page) => (
  <PageLayout subscribe={false}>{page}</PageLayout>
);

export default NotFoundPage;
