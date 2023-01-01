import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Container,
  Typography,
} from "@mui/material";
import { GetStaticProps } from "next";

import { isProduction } from "../lib/config";
import { NextPageWithLayout } from "../shared/layout";
import { ButtonsDemo } from "./playground.page/buttons-demo";
import { ChipsDemo } from "./playground.page/chips-demo";
import { InputsDemo } from "./playground.page/inputs-demo";
import { SelectMenusDemo } from "./playground.page/select-menus-demo";

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
          <ButtonsDemo />
        </AccordionDetails>
      </Accordion>
      {/* INPUTS */}
      <Accordion>
        <AccordionSummary>
          <Typography variant="h4">Inputs</Typography>
        </AccordionSummary>
        <AccordionDetails>
          <InputsDemo />
        </AccordionDetails>
      </Accordion>
      {/* CHIPS */}
      <Accordion>
        <AccordionSummary>
          <Typography variant="h4">Chips</Typography>
        </AccordionSummary>
        <AccordionDetails>
          <ChipsDemo />
        </AccordionDetails>
      </Accordion>
      {/* SELECT MENUS */}
      <Accordion expanded>
        <AccordionSummary>
          <Typography variant="h4">Select Menus</Typography>
        </AccordionSummary>
        <AccordionDetails>
          <SelectMenusDemo />
        </AccordionDetails>
      </Accordion>
      <Box mb={45} />
    </Container>
  );
};

export default Page;
