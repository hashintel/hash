import { apiOrigin } from "@local/hash-graphql-shared/environment";
import { types } from "@local/hash-isomorphic-utils/ontology-types";
import { Entity } from "@local/hash-subgraph";
import { getRoots } from "@local/hash-subgraph/stdlib";
import { Box, Container, Typography } from "@mui/material";
import { useContext, useEffect, useState } from "react";

import { useBlockProtocolQueryEntities } from "../../components/hooks/block-protocol-functions/knowledge/use-block-protocol-query-entities";
import { getLayoutWithSidebar, NextPageWithLayout } from "../../shared/layout";
import { Button } from "../../shared/ui/button";
import { useAuthenticatedUser } from "../shared/auth-info-context";
import { WorkspaceContext } from "../shared/workspace-context";

const Page: NextPageWithLayout = () => {
  const { authenticatedUser } = useAuthenticatedUser();
  const { activeWorkspace } = useContext(WorkspaceContext);
  const { queryEntities } = useBlockProtocolQueryEntities();

  const [linearIntegrationEntities, setLinearIntegrationEntities] = useState<
    Entity[]
  >([]);

  useEffect(() => {
    const init = async () => {
      const { data } = await queryEntities({
        data: {
          operation: {
            multiFilter: {
              filters: [
                {
                  field: ["ownedById"],
                  operator: "EQUALS",
                  value: authenticatedUser.accountId,
                },
                {
                  field: ["metadata", "entityTypeId"],
                  operator: "EQUALS",
                  value: types.entityType.linearIntegration.entityTypeId,
                },
              ],
              operator: "AND",
            },
          },
        },
      });

      if (data) {
        setLinearIntegrationEntities(getRoots(data));
      }
    };

    void init();
  }, [queryEntities, authenticatedUser]);

  // eslint-disable-next-line no-console
  console.log({ linearIntegrationEntities });

  if (!activeWorkspace) {
    return <>Loading workspace...</>;
  }

  const workspaceLabel =
    activeWorkspace.kind === "user" ? "your" : `${activeWorkspace.name}'s`;

  return (
    <Container>
      <Box sx={{ paddingLeft: 4 }}>
        <Typography variant="h1" mt={10} mb={4} fontWeight="bold">
          Integrations – Linear
        </Typography>
        <Button
          href={`${apiOrigin}/oauth/linear?ownedById=${activeWorkspace.accountId}`}
        >
          Connect your Linear account to {workspaceLabel} workspace
        </Button>
      </Box>
    </Container>
  );
};

Page.getLayout = (page) => getLayoutWithSidebar(page, { fullWidth: true });

export default Page;
