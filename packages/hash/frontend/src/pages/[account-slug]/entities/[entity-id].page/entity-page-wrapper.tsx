import { Box, Stack } from "@mui/material";
import { Container } from "@mui/system";
import { useRouter } from "next/router";
import { PropsWithChildren, useEffect } from "react";
import { useBlockProtocolGetEntity } from "../../../../components/hooks/blockProtocolFunctions/knowledge/useBlockProtocolGetEntity";
import { useEntityEditor } from "./entity-editor-context";
import { EntityPageHeader } from "./entity-page-wrapper/entity-page-header";

/**
 * We'll change `[entity-id].page.tsx` to a tabbed page,
 * When that happens, this component will provide the tabs to each page
 */
export const EntityPageWrapper = ({ children }: PropsWithChildren) => {
  const router = useRouter();
  const { entity, setEntity } = useEntityEditor();
  const { getEntity } = useBlockProtocolGetEntity();

  useEffect(() => {
    const init = async () => {
      const entityId = router.query["entity-id"] as string;

      const res = await getEntity({ data: { entityId } });

      setEntity(res.data);
    };

    void init();
  }, [router.query, getEntity, setEntity]);

  if (!entity) return <h1>Loading...</h1>;

  return (
    <Stack height="100vh">
      <EntityPageHeader />
      <Box flex={1} bgcolor="gray.10" borderTop={1} borderColor="gray.20">
        <Container
          sx={{
            py: 5,
            display: "flex",
            flexDirection: "column",
            gap: 6.5,
          }}
        >
          {children}
        </Container>
      </Box>
    </Stack>
  );
};
