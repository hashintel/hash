import { faAsterisk } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@hashintel/hash-design-system";
import { getEntityTypeById } from "@hashintel/hash-subgraph/src/stdlib/element/entity-type";
import { getRoots } from "@hashintel/hash-subgraph/src/stdlib/roots";
import { Box, Typography } from "@mui/material";

import { SectionWrapper } from "../../../shared/section-wrapper";
import { WhiteCard } from "../../../shared/white-card";
import { useEntityEditor } from "./entity-editor-context";

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
  const { entitySubgraph } = useEntityEditor();

  const entity = getRoots(entitySubgraph)[0]!;

  const entityTypeTitle = getEntityTypeById(
    entitySubgraph,
    entity.metadata.entityTypeId,
  )!.schema.title;
  const entityTypeUrl = entity.metadata.entityTypeId.replace(/v\/\d+/, "");

  return (
    <SectionWrapper
      title="Types"
      titleTooltip="Types describe what an entity is, allowing information to be associated with it. Entities can have an unlimited number of types."
    >
      <Box display="flex" gap={2}>
        <TypeCard url={entityTypeUrl} title={entityTypeTitle} />
      </Box>
    </SectionWrapper>
  );
};
