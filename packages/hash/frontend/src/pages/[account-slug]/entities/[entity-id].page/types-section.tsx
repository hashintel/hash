import { faAsterisk } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@hashintel/hash-design-system/fontawesome-icon";
import { Box, Typography } from "@mui/material";
import { useRouter } from "next/router";
import { WhiteCard } from "../../types/entity-type/white-card";
import { useEntityEditor } from "./entity-editor-context";
import { EntitySection } from "./shared/entity-section";

export const TypesSection = () => {
  const router = useRouter();
  const { entity } = useEntityEditor();

  if (!entity) {
    return null;
  }

  const entityTypeTitle = entity.entityTypeRootedSubgraph.entityType.title;
  const entityTypeUrl = entity.entityTypeId.replace(/v\/\d+/, "");

  return (
    <EntitySection title="Type">
      <Box display="flex">
        <WhiteCard onClick={() => router.push(entityTypeUrl)}>
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              px: 1.5,
              py: 1.25,
              gap: 1.25,
              color: ({ palette }) => palette.black,
            }}
          >
            <FontAwesomeIcon icon={faAsterisk} />
            <Typography variant="smallTextLabels" fontWeight={600}>
              {entityTypeTitle}
            </Typography>
          </Box>
        </WhiteCard>
      </Box>
    </EntitySection>
  );
};
