import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Typography,
  Container,
  Box,
} from "@mui/material";
import { GetStaticProps } from "next";
import { NextPageWithLayout } from "../shared/layout";
import { isProduction } from "../lib/config";
import { Buttons } from "./playground.page/button";
import { Inputs } from "./playground.page/input";
import { SelectMenus } from "./playground.page/select-menus";
import { Chips } from "./playground.page/chips";

interface PageProps {}

export const getStaticProps: GetStaticProps<PageProps> = () => {
  if (isProduction) {
    return { notFound: true };
  }
  return {
    props: {},
  };
};

const Page: NextPageWithLayout<PageProps> = () => {
  return (
    <Container sx={{ pt: 10 }}>
      <Typography mb={4} variant="h1">
        Playground
      </Typography>
      {/* BUTTONS */}
      <Accordion>
        <AccordionSummary>
          <Typography variant="h4">Buttons</Typography>
        </AccordionSummary>
        <AccordionDetails>
          <Buttons />
        </AccordionDetails>
      </Accordion>
      {/* INPUTS */}
      <Accordion>
        <AccordionSummary>
          <Typography variant="h4">Inputs</Typography>
        </AccordionSummary>
        <AccordionDetails>
          <Inputs />
        </AccordionDetails>
      </Accordion>
      {/* CHIPS */}
      <Accordion>
        <AccordionSummary>
          <Typography variant="h4">Chips</Typography>
        </AccordionSummary>
        <AccordionDetails>
          <Chips />
        </AccordionDetails>
      </Accordion>
      {/* SELECT MENUS */}
      <Accordion expanded>
        <AccordionSummary>
          <Typography variant="h4">Select Menus</Typography>
        </AccordionSummary>
        <AccordionDetails>
          <SelectMenus />
        </AccordionDetails>
      </Accordion>
      <Box mb={25} />
    </Container>
  );
};

export default Page;
