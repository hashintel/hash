import type { VersionedUrl } from "@blockprotocol/type-system/slim";
import { OntologyChip } from "@hashintel/design-system";
import { frontendDomain } from "@local/hash-isomorphic-utils/environment";
import { linkEntityTypeUrl } from "@local/hash-subgraph";
import { Box, Container, Stack, Typography } from "@mui/material";
import { useRouter } from "next/router";
import { useContext } from "react";

import type { NextPageWithLayout } from "../../../shared/layout";
import { getLayoutWithSidebar } from "../../../shared/layout";
import { CreateEntityTypeForm } from "../../shared/create-entity-type-form";
import { TopContextBar } from "../../shared/top-context-bar";
import { WorkspaceContext } from "../../shared/workspace-context";

const Page: NextPageWithLayout = () => {
  const router = useRouter();

  const { activeWorkspace } = useContext(WorkspaceContext);

  if (!activeWorkspace) {
    return null;
  }

  const initialData = {
    extendsEntityTypeId:
      typeof router.query.extends === "string"
        ? (router.query.extends as VersionedUrl)
        : undefined,
    name: typeof router.query.name === "string" ? router.query.name : undefined,
  };

  const isCreateLinkEntityType =
    initialData.extendsEntityTypeId === linkEntityTypeUrl;

  return (
    <Stack sx={{ height: "100vh" }}>
      <Box bgcolor="white">
        <TopContextBar
          defaultCrumbIcon={null}
          crumbs={[
            {
              title: "Types",
              id: "types",
              href: "/types",
            },
            {
              title: `${isCreateLinkEntityType ? "Link" : "Entity"} types`,
              href: `/types/${isCreateLinkEntityType ? "link" : "entity"}-type`,
              id: "entity-types",
            },
          ]}
          scrollToTop={() => {}}
        />
        <Box py={3.75}>
          <Container>
            <OntologyChip
              domain={frontendDomain}
              path={`@${activeWorkspace.shortname}/types/entity-type`}
              sx={[{ marginBottom: 2 }]}
            />
            <Typography variant="h1" fontWeight="bold">
              Create new {isCreateLinkEntityType ? "link" : "entity"} type
            </Typography>
          </Container>
        </Box>
      </Box>
      <Box
        flex={1}
        bgcolor="gray.10"
        borderTop={1}
        borderColor="gray.20"
        pt={5}
      >
        <Container>
          <CreateEntityTypeForm
            key={JSON.stringify(initialData)} // re-render the form to reset state when the initial data changes
            initialData={initialData}
            onCancel={() => router.push("/")}
          />
        </Container>
      </Box>
    </Stack>
  );
};

Page.getLayout = (page) =>
  getLayoutWithSidebar(page, {
    fullWidth: true,
  });

export default Page;
