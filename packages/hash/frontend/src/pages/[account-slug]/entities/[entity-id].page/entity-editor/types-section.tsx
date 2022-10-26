import { faAsterisk } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@hashintel/hash-design-system/fontawesome-icon";
import { Box, Typography } from "@mui/material";
import { getPersistedEntityType } from "../../../../../lib/subgraph";
import { WhiteCard } from "../../../types/entity-type/white-card";
import { useEntityEditor } from "./entity-editor-context";
import { EntitySection } from "./shared/entity-section";

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
  const { rootEntityAndSubgraph } = useEntityEditor();

  if (!rootEntityAndSubgraph) {
    return null;
  }

  const entity = rootEntityAndSubgraph.root;

  const entityTypeTitle = getPersistedEntityType(
    rootEntityAndSubgraph.subgraph,
    entity.entityTypeId,
  )!.inner.title;
  const entityTypeUrl = entity.entityTypeId.replace(/v\/\d+/, "");

  return (
    <EntitySection
      title="Type"
      titleTooltip="Types describe what an entity is, allowing information to be associated with it. Entities can have an unlimited number of types."
    >
      <Box display="flex" gap={2}>
        <TypeCard url={entityTypeUrl} title={entityTypeTitle} />
      </Box>
    </EntitySection>
  );
};
