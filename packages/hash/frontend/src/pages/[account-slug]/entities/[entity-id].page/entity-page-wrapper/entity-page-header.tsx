import { faAsterisk } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@hashintel/hash-design-system/fontawesome-icon";
import { Box, Stack, Typography } from "@mui/material";
import { Container } from "@mui/system";
import { useRouter } from "next/router";
import slugify from "slugify";
import { generateEntityLabel } from "../../../../../lib/entities";
import { TopContextBar } from "../../../../shared/top-context-bar";
import { HashOntologyIcon } from "../../../types/entity-type/hash-ontology-icon";
import { OntologyChip } from "../../../types/entity-type/ontology-chip";
import { Subgraph } from "../../../../../lib/subgraph";

export const EntityPageHeader = ({
  entityRootedSubgraph,
}: {
  entityRootedSubgraph: Subgraph;
}) => {
  const router = useRouter();

  const accountSlug = router.query["account-slug"];

  const entityLabel = generateEntityLabel(entityRootedSubgraph);

  return (
    <Box bgcolor="white">
      <TopContextBar
        defaultCrumbIcon={null}
        crumbs={[
          {
            title: "Entities",
            href: `/${accountSlug}/entities`,
            id: "entities",
          },
          {
            title: entityLabel,
            href: "#",
            id: "entityId",
            icon: <FontAwesomeIcon icon={faAsterisk} />,
          },
        ]}
        scrollToTop={() => {}}
      />
      <Box py={3.75}>
        <Container>
          <OntologyChip
            icon={<HashOntologyIcon />}
            domain="hash.ai"
            path={
              <>
                <Typography color="inherit" fontWeight="bold">
                  {accountSlug}
                </Typography>
                /entities
                <Typography color="inherit" fontWeight="bold">
                  /{slugify(entityLabel, { lower: true })}
                </Typography>
              </>
            }
            sx={[
              {
                marginBottom: 2,
                "> *": { color: (theme) => theme.palette.blue[70] },
              },
            ]}
          />

          <Stack direction="row" alignItems="center" spacing={2}>
            <FontAwesomeIcon icon={faAsterisk} sx={{ fontSize: 40 }} />
            <Typography variant="h1" fontWeight="bold">
              {entityLabel}
            </Typography>
          </Stack>
        </Container>
      </Box>
    </Box>
  );
};
