import type { BaseUrl } from "@blockprotocol/type-system";
import { faCircleQuestion } from "@fortawesome/free-regular-svg-icons";
import { FontAwesomeIcon } from "@hashintel/design-system";
import { Box } from "@mui/material";

import { EntitiesVisualizer } from "../entities-visualizer";
import { SectionWrapper } from "../section-wrapper";
import { useEntityType } from "./shared/entity-type-context";

export const EntitiesTab = ({
  entityTypeBaseUrl,
}: {
  entityTypeBaseUrl: BaseUrl;
}) => {
  const entityType = useEntityType();

  return (
    <Box>
      <SectionWrapper
        title="Entities"
        titleTooltip={`This table lists all entities with the ‘${entityType.title}’ type that are accessible to you`}
        tooltipIcon={
          <FontAwesomeIcon icon={faCircleQuestion} sx={{ fontSize: 14 }} />
        }
      >
        <EntitiesVisualizer entityTypeBaseUrl={entityTypeBaseUrl} />
      </SectionWrapper>
    </Box>
  );
};
