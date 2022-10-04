import { faAsterisk } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@hashintel/hash-design-system/fontawesome-icon";
import { Box, Stack, Typography } from "@mui/material";
import { Container } from "@mui/system";
import { TopContextBar } from "../../../shared/top-context-bar";
import { OntologyChip } from "../../entity-types/ontology-chip";
import { PlaceholderIcon } from "../../entity-types/placeholder-icon";

export const EntityPageHeader = () => {
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
            title: "Microsoft",
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
                  /microsoft
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
              Microsoft
            </Typography>
          </Stack>
        </Container>
      </Box>
    </Box>
  );
};
