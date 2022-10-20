import { faAsterisk } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@hashintel/hash-design-system/fontawesome-icon";
import { Box, Typography } from "@mui/material";
import { WhiteCard } from "../../types/entity-type/white-card";
import { useEntityEditor } from "./entity-editor-context";
import { EntitySection } from "./shared/entity-section";
import { getPersistedEntityType } from "../../../../lib/subgraph";
import { mustBeVersionedUri } from "../../types/entity-type/util";

interface TypeCardProps {
  url: string;
  title: string;
}

const TypeCard = ({ url, title }: TypeCardProps) => {
  return (
    <WhiteCard href={url}>
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
          {title}
        </Typography>
      </Box>
    </WhiteCard>
  );
};

export const TypesSection = () => {
  const { entity } = useEntityEditor();

  if (!entity) {
    return null;
  }

  const entityTypeTitle = getPersistedEntityType(
    entity.entityTypeRootedSubgraph,
    entity.entityTypeId,
  )!.inner.title;

  return (
    <EntitySection title="Type">
      <Box display="flex" gap={2}>
        <TypeCard url={entity.entityTypeId} title={entityTypeTitle} />
      </Box>
    </EntitySection>
  );
};
