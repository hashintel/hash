import { Button, TextField } from "@hashintel/hash-design-system";
import { Box, Container, Stack, Typography } from "@mui/material";
import Image from "next/image";
import { Router } from "next/router";
import { FormEvent, useEffect, useState } from "react";
import { useUser } from "../../../components/hooks/useUser";
import { getPlainLayout, NextPageWithLayout } from "../../../shared/layout";
import { TopContextBar } from "../../shared/top-context-bar";
import { useBlockProtocolFunctionsWithOntology } from "../../type-editor/blockprotocol-ontology-functions-hook";
import { OurChip, placeholderUri } from "./Chip";

// @todo pass ocorrect router in
const useWarnIfUnsavedChanges = (
  unsavedChanges: boolean,
  callback: () => boolean,
) => {
  useEffect(() => {
    if (unsavedChanges) {
      const routeChangeStart = () => {
        const ok = callback();
        if (!ok) {
          Router.events.emit("routeChangeError");
          throw new Error("Abort route change. Please ignore this error.");
        }
      };
      Router.events.on("routeChangeStart", routeChangeStart);

      return () => {
        Router.events.off("routeChangeStart", routeChangeStart);
      };
    }
  }, [unsavedChanges]);
};

const Page: NextPageWithLayout = () => {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const { user } = useUser();

  const fns = useBlockProtocolFunctionsWithOntology(user?.accountId ?? "");

  const unsavedChanges = !!(name || description);
  // @todo isn't owrkin
  useWarnIfUnsavedChanges(unsavedChanges, () => {
    return confirm(
      "You have unsaved changes. Are you sure you would like to exit?",
    );
  });

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

              await fns.createEntityType({
                data: {
                  entityType: {
                    type: "object",
                    kind: "entityType",
                    $id: `https://hash.ai/entity-type/${name
                      .toLowerCase()
                      .replace(/\s/g, "")}`,
                    title: name,
                    // @todo check this
                    pluralTitle: name,
                    description,
                    properties: {},
                  },
                },
              });
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
