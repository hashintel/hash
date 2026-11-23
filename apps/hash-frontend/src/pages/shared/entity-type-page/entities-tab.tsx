import { Box } from "@mui/material";

import { HashInlineIcon } from "@hashintel/design-system";

import { EntitiesVisualizer } from "../entities-visualizer";
import { SectionWrapper } from "../section-wrapper";
import { useEntityType } from "./shared/entity-type-context";

import type { BaseUrl } from "@blockprotocol/type-system";

const faCircleQuestion = { icon: "help" } as const;

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
          <HashInlineIcon icon={faCircleQuestion} sx={{ fontSize: 14 }} />
        }
      >
        <EntitiesVisualizer entityTypeBaseUrl={entityTypeBaseUrl} />
      </SectionWrapper>
    </Box>
  );
};
