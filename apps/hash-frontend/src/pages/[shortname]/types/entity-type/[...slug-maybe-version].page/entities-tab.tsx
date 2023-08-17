import { faCircleQuestion } from "@fortawesome/free-regular-svg-icons";
import {
  faAsterisk,
  faMagnifyingGlass,
} from "@fortawesome/free-solid-svg-icons";
import { Chip, FontAwesomeIcon, IconButton } from "@hashintel/design-system";
import { extractOwnedByIdFromEntityId } from "@local/hash-subgraph";
import { Box, Paper, Stack } from "@mui/material";
import { FunctionComponent, useContext, useMemo, useState } from "react";

import { EarthAmericasRegularIcon } from "../../../../../shared/icons/earth-americas-regular";
import { HomeIcon } from "../../../../../shared/icons/home-icon";
import { EntitiesTable } from "../../../../shared/entities-table";
import { WorkspaceContext } from "../../../../shared/workspace-context";
import { SectionEmptyState } from "../../../shared/section-empty-state";
import { SectionWrapper } from "../../../shared/section-wrapper";
import { WhiteChip } from "../../../shared/white-chip";
import { useEntityType } from "./shared/entity-type-context";
import { useEntityTypeEntities } from "./shared/entity-type-entities-context";

export const EntitiesTab: FunctionComponent = () => {
  const [_showSearch, setShowSearch] = useState<boolean>(false);

  const { entities } = useEntityTypeEntities();

  const { activeWorkspaceAccountId, activeWorkspace } =
    useContext(WorkspaceContext);

  const entityType = useEntityType();

  const entitiesCount = useMemo(() => {
    const namespaceEntities =
      entities?.filter(
        (entity) =>
          extractOwnedByIdFromEntityId(entity.metadata.recordId.entityId) ===
          activeWorkspaceAccountId,
      ) ?? [];

    return {
      namespace: namespaceEntities.length,
      public: (entities?.length ?? 0) - namespaceEntities.length,
    };
  }, [entities, activeWorkspaceAccountId]);

  const isEmpty = entitiesCount.namespace + entitiesCount.public === 0;

  return (
    <Box>
      <SectionWrapper
        title="Entities"
        titleTooltip={`This table lists all entities with the ‘${entityType.title}’ type that are accessible to you`}
        titleStartContent={
          <Stack direction="row">
            {entitiesCount.namespace || entitiesCount.public ? (
              <Stack direction="row" spacing={1.5} mr={2}>
                {entitiesCount.namespace ? (
                  <Chip
                    size="xs"
                    label={`${entitiesCount.namespace} in @${activeWorkspace?.shortname}`}
                    icon={<HomeIcon />}
                    sx={({ palette }) => ({ color: palette.gray[70] })}
                  />
                ) : null}

                {entitiesCount.public ? (
                  <WhiteChip
                    size="xs"
                    label={`${entitiesCount.public} public`}
                    icon={<EarthAmericasRegularIcon />}
                  />
                ) : null}
              </Stack>
            ) : null}

            <IconButton
              rounded
              onClick={() => setShowSearch(true)}
              sx={{ color: ({ palette }) => palette.gray[60] }}
            >
              <FontAwesomeIcon icon={faMagnifyingGlass} />
            </IconButton>
          </Stack>
        }
        tooltipIcon={
          <FontAwesomeIcon icon={faCircleQuestion} sx={{ fontSize: 14 }} />
        }
      >
        {isEmpty ? (
          <Paper sx={{ overflow: "hidden" }}>
            <SectionEmptyState
              title="There are no entities of this type visible to you"
              titleIcon={
                <FontAwesomeIcon icon={faAsterisk} sx={{ fontSize: 18 }} />
              }
              description="Assigning this type to an entity will result in it being shown here"
            />
          </Paper>
        ) : (
          <Box
            sx={{
              height: "50vh",
            }}
          >
            <EntitiesTable />
          </Box>
        )}
      </SectionWrapper>
    </Box>
  );
};
