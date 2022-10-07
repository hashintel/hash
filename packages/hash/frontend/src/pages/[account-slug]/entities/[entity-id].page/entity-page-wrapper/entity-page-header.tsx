import { faAsterisk } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@hashintel/hash-design-system/fontawesome-icon";
import { Box, Stack, Typography } from "@mui/material";
import { Container } from "@mui/system";
import { generateEntityLabel } from "../../../../../lib/entities";
import { TopContextBar } from "../../../../shared/top-context-bar";
import { OntologyChip } from "../../../entity-types/ontology-chip";
import { PlaceholderIcon } from "../../../entity-types/placeholder-icon";
import { useEntityEditor } from "../entity-editor-context";

export const EntityPageHeader = () => {
  const { entity } = useEntityEditor();

  if (!entity) return null;

  const entityLabel = generateEntityLabel(entity);

  return (
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
            title: "Entities",
            href: "#",
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
            icon={<PlaceholderIcon />}
            domain="hash.ai"
            path={
              <>
                <Typography color="inherit" fontWeight="bold">
                  @acme-corp
                </Typography>
                /entities
                <Typography color="inherit" fontWeight="bold">
                  /{entityLabel}
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
