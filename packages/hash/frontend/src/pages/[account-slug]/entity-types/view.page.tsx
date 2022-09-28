import { Box, Collapse, Container, Stack, Typography } from "@mui/material";
import { useRef } from "react";
import { BriefcaseIcon } from "../../../shared/icons/svg";
import { getPlainLayout, NextPageWithLayout } from "../../../shared/layout";
import { TopContextBar } from "../../shared/top-context-bar";
import { EmptyPropertyListCard } from "./empty-property-list-card";
import { OntologyChip } from "./ontology-chip";
import { PlaceholderIcon } from "./placeholder-icon";
import { InsertPropertyCard } from "./property-list-card";
import { useStateCallback } from "./util";

const Page: NextPageWithLayout = () => {
  const [mode, setMode] = useStateCallback<"empty" | "inserting">("empty");
  const insertFieldRef = useRef<HTMLInputElement>(null);

  return (
    <Box
      component={Stack}
      sx={(theme) => ({
        minHeight: "100vh",
        background: theme.palette.gray[10],
      })}
    >
      <Box bgcolor="white" borderBottom={1} borderColor="gray.20">
        <TopContextBar
          defaultCrumbIcon={null}
          crumbs={[
            {
              title: "Types",
              href: "#",
              id: "types",
            },
            {
              title: "Entity types",
              href: "#",
              id: "entity-types",
            },
          ]}
          scrollToTop={() => {}}
        />
        <Box pt={3.75}>
          <Container>
            <OntologyChip
              icon={<PlaceholderIcon />}
              domain="hash.ai"
              path={
                <>
                  <Typography
                    component="span"
                    fontWeight="bold"
                    color={(theme) => theme.palette.blue[70]}
                  >
                    @acme-corp
                  </Typography>
                  <Typography
                    component="span"
                    color={(theme) => theme.palette.blue[70]}
                  >
                    /entity-types/
                  </Typography>
                  <Typography
                    component="span"
                    fontWeight="bold"
                    color={(theme) => theme.palette.blue[70]}
                  >
                    @company
                  </Typography>
                </>
              }
            />
            <Typography variant="h1" fontWeight="bold" mt={3} mb={4.5}>
              <Box
                component="span"
                sx={(theme) => ({
                  mr: 3,
                  verticalAlign: "middle",
                  color: theme.palette.gray[70],

                  svg: { height: 40 },
                })}
              >
                <BriefcaseIcon />
              </Box>
              Company
            </Typography>
          </Container>
        </Box>
      </Box>
      <Box py={5}>
        <Container>
          <Typography variant="h5" mb={1.25}>
            Properties of{" "}
            <Box component="span" sx={{ fontWeight: "bold" }}>
              company
            </Box>
          </Typography>
          <Collapse timeout={0} in={mode === "empty"}>
            <EmptyPropertyListCard
              onClick={() => {
                setMode("inserting", () => {
                  insertFieldRef.current?.focus();
                });
              }}
            />
          </Collapse>
          <Collapse timeout={0} in={mode === "inserting"}>
            <InsertPropertyCard
              insertFieldRef={insertFieldRef}
              onCancel={() => {
                setMode("empty");
              }}
            />
          </Collapse>
        </Container>
      </Box>
    </Box>
  );
};

Page.getLayout = getPlainLayout;

export default Page;
