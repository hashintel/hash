import { Button, TextField } from "@hashintel/hash-design-system";
import { Box, Container, Stack, Typography } from "@mui/material";
import Image from "next/image";
import { Router, useRouter } from "next/router";
import { FormEvent, useEffect, useState } from "react";
import { useUser } from "../../../components/hooks/useUser";
import { getPlainLayout, NextPageWithLayout } from "../../../shared/layout";
import { TopContextBar } from "../../shared/top-context-bar";
import { useBlockProtocolFunctionsWithOntology } from "../../type-editor/blockprotocol-ontology-functions-hook";
import { OurChip, placeholderUri } from "./Chip";

const Page: NextPageWithLayout = () => {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const router = useRouter();

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
            <OurChip
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
                  /entity-types
                </>
              }
              sx={[{ marginBottom: 2 }]}
            />
            <Typography variant="h1" fontWeight="bold">
              Create new entity type
            </Typography>
          </Container>
        </Box>
      </Box>
      <Box flex={1} bgcolor="gray.10" borderTop={1} borderColor="gray.20">
        <Container>
          <Box
            py={8}
            component="form"
            onSubmit={async (evt: FormEvent) => {
              evt.preventDefault();
              void router.push("/@foo/entity-types/view");
            }}
          >
            <Stack
              alignItems="flex-start"
              sx={{ width: "60%", maxWidth: 600 }}
              spacing={3}
            >
              <TextField
                label="Singular Name"
                name="name"
                type="text"
                placeholder="e.g. Stock Price"
                value={name}
                onChange={(evt) => setName(evt.target.value)}
                required
              />
              <TextField
                multiline
                label="Description"
                name="description"
                type="text"
                placeholder="Describe this entity in one or two sentences"
                value={description}
                onChange={(evt) => setDescription(evt.target.value)}
                required
                sx={{
                  width: "90%",
                }}
              />
              <Stack direction="row" spacing={1.25}>
                <Button type="submit">Create new entity type</Button>
                {/** @todo set correct URL */}
                <Button href="/" variant="tertiary">
                  Discard draft
                </Button>
              </Stack>
            </Stack>
          </Box>
        </Container>
      </Box>
    </Stack>
  );
};

Page.getLayout = getPlainLayout;

export default Page;
