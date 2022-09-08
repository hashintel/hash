import { faBriefcase, faList } from "@fortawesome/free-solid-svg-icons";
import { Button, FontAwesomeIcon } from "@hashintel/hash-design-system";
import { Box, Container, Stack, Typography } from "@mui/material";
import Image from "next/image";
import { useState } from "react";
import { useUser } from "../../../components/hooks/useUser";
import { getPlainLayout, NextPageWithLayout } from "../../../shared/layout";
import { TopContextBar } from "../../shared/top-context-bar";
import { useBlockProtocolFunctionsWithOntology } from "../../type-editor/blockprotocol-ontology-functions-hook";
import { Chip, placeholderUri } from "./Chip";

const Page: NextPageWithLayout = () => {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const { user } = useUser();

  const fns = useBlockProtocolFunctionsWithOntology(user?.accountId ?? "");

  return (
    <Stack sx={{ height: "100vh" }}>
      <Box bgcolor="white">
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
        <Box py={3.75}>
          <Container>
            <Chip
              icon={
                <Box
                  component={Image}
                  src={placeholderUri}
                  layout="fill"
                  alt=""
                />
              }
              domain="hash.ai"
              path={
                <>
                  <Typography
                    component="span"
                    fontWeight="bold"
                    color="inherit"
                  >
                    @acme-corp
                  </Typography>
                  /entity-types/
                  <Typography
                    component="span"
                    fontWeight="bold"
                    color="inherit"
                  >
                    @company
                  </Typography>
                </>
              }
              sx={[{ marginBottom: 2 }]}
            />
            <Typography variant="h1" fontWeight="bold">
              <FontAwesomeIcon icon={faBriefcase} />
              Company
            </Typography>
          </Container>
        </Box>
      </Box>
      <Box flex={1} bgcolor="gray.10" borderTop={1} borderColor="gray.20">
        <Container>
          <Typography>
            Properties of{" "}
            <Box component="span" sx={{ fontWeight: "bold" }}>
              company
            </Box>
          </Typography>
          <Box
            sx={(theme) => ({
              backgroundColor: theme.palette.white,
              boxShadow: theme.shadows.xs,
              borderRadius: 6,
              p: 4,
            })}
          >
            <Stack direction="row">
              <FontAwesomeIcon icon={faList} />
              <Box>
                <Button>Add a property +</Button>
                <Typography>
                  Properties store individual pieces of information about some
                  aspect of an entity e.g. a person entity might have a date of
                  birth property which expects a date
                </Typography>
              </Box>
            </Stack>
          </Box>
        </Container>
      </Box>
    </Stack>
  );
};

Page.getLayout = getPlainLayout;

export default Page;
