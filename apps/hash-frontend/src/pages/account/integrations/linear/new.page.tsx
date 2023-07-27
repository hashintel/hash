import { types } from "@local/hash-isomorphic-utils/ontology-types";
import { Entity } from "@local/hash-subgraph/.";
import { getRoots } from "@local/hash-subgraph/stdlib";
import { extractBaseUrl } from "@local/hash-subgraph/type-system-patch";
import { Container, Typography } from "@mui/material";
import { useRouter } from "next/router";
import { useEffect, useMemo, useState } from "react";

import { useBlockProtocolQueryEntities } from "../../../../components/hooks/block-protocol-functions/knowledge/use-block-protocol-query-entities";
import {
  getLayoutWithSidebar,
  NextPageWithLayout,
} from "../../../../shared/layout";
import { useAuthenticatedUser } from "../../../shared/auth-info-context";
import { SelectLinearTeams } from "./select-linear-teams";

const NewLinearIntegrationPage: NextPageWithLayout = () => {
  const router = useRouter();
  const { authenticatedUser } = useAuthenticatedUser();
  const { queryEntities } = useBlockProtocolQueryEntities();

  const linearIntegrationEntityId = useMemo(() => {
    return router.query.linearIntegrationEntityId as string;
  }, [router]);

  const [linearIntegrationEntities, setLinearIntegrationEntities] =
    useState<Entity[]>();

  useEffect(() => {
    void (async () => {
      const { data } = await queryEntities({
        data: {
          operation: {
            multiFilter: {
              filters: [
                /** @todo: figure out how to make this work */
                // {
                //   field: ["ownedById"],
                //   operator: "EQUALS",
                //   value: authenticatedUser.accountId,
                // },
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
    })();
  }, [queryEntities, authenticatedUser]);

  const linearIntegrationEntity = useMemo(() => {
    if (linearIntegrationEntities && linearIntegrationEntityId) {
      return linearIntegrationEntities.find(
        ({
          metadata: {
            recordId: { entityId },
          },
        }) => entityId === linearIntegrationEntityId,
      );
    }
  }, [linearIntegrationEntities, linearIntegrationEntityId]);

  const linearOrgId = linearIntegrationEntity?.properties[
    extractBaseUrl(types.propertyType.linearOrgId.propertyTypeId)
  ] as string | undefined;

  return (
    <Container>
      <Typography variant="h1" mt={10} mb={4} fontWeight="bold">
        Linear
      </Typography>
      <Typography>Connecting to Linear</Typography>
      {linearOrgId ? <SelectLinearTeams linearOrgId={linearOrgId} /> : null}
    </Container>
  );
};

NewLinearIntegrationPage.getLayout = (page) =>
  getLayoutWithSidebar(page, { fullWidth: true });

export default NewLinearIntegrationPage;
