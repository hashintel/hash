import { CaretDownSolidIcon } from "@hashintel/design-system";
import { generateEntityLabel } from "@local/hash-isomorphic-utils/generate-entity-label";
import {
  Entity,
  EntityRootType,
  extractEntityUuidFromEntityId,
  Subgraph,
} from "@local/hash-subgraph";
import { Box, buttonClasses, Collapse, Typography } from "@mui/material";
import { FunctionComponent, useMemo, useState } from "react";

import { useGetOwnerForEntity } from "../../components/hooks/use-get-owner-for-entity";
import { ArrowUpRightRegularIcon } from "../../shared/icons/arrow-up-right-regular-icon";
import { Button, Link } from "../../shared/ui";
import { DraftEntityActionButtons } from "./draft-entity/draft-entity-action-buttons";
import { DraftEntityProperties } from "./draft-entity/draft-entity-properties";
import { DraftEntityProvenance } from "./draft-entity/draft-entity-provenance";
import { DraftEntityType } from "./draft-entity/draft-entity-type";
import { DraftEntityViewers } from "./draft-entity/draft-entity-viewers";

export const DraftEntity: FunctionComponent<{
  subgraph: Subgraph<EntityRootType>;
  entity: Entity;
  createdAt: Date;
}> = ({ entity, subgraph, createdAt }) => {
  const getOwnerForEntity = useGetOwnerForEntity();

  const [displayProperties, setDisplayProperties] = useState<boolean>(false);

  const href = useMemo(() => {
    const { shortname } = getOwnerForEntity(entity);

    return `/@${shortname}/entities/${extractEntityUuidFromEntityId(
      entity.metadata.recordId.entityId,
    )}`;
  }, [getOwnerForEntity, entity]);

  const label = useMemo(
    () => generateEntityLabel(subgraph, entity),
    [subgraph, entity],
  );

  return (
    <Box paddingY={4.5} paddingX={3.25}>
      <Box
        display="flex"
        justifyContent="space-between"
        alignItems="flex-start"
      >
        {/* @todo: open in a slide-over instead of redirecting */}
        <Link
          noLinkStyle
          href={href}
          sx={{
            "&:hover > div": {
              background: ({ palette }) => palette.blue[15],
            },
          }}
        >
          <Box
            sx={{
              transition: ({ transitions }) => transitions.create("background"),
              borderRadius: "6px",
              paddingY: 0.5,
              paddingX: 1,
              marginLeft: -1,
            }}
          >
            <Typography
              variant="h2"
              sx={{
                fontSize: 24,
                fontWeight: 600,
                color: ({ palette }) => palette.gray[90],
              }}
            >
              {label}
              <ArrowUpRightRegularIcon
                sx={{
                  color: ({ palette }) => palette.blue[70],
                  position: "relative",
                  top: 5,
                  marginLeft: 0.5,
                }}
              />
            </Typography>
          </Box>
        </Link>
        <DraftEntityActionButtons
          entity={entity}
          label={label}
          subgraph={subgraph}
        />
      </Box>
      <Box marginTop={1.5} display="flex" justifyContent="space-between">
        <Box display="flex" alignItems="center" columnGap={2}>
          <DraftEntityType entity={entity} subgraph={subgraph} />
          <DraftEntityViewers entity={entity} />
          <Button
            size="xs"
            variant="tertiary_quiet"
            endIcon={<CaretDownSolidIcon />}
            onClick={() => setDisplayProperties(!displayProperties)}
            sx={{
              padding: 0,
              minHeight: "unset",
              "&:hover": {
                background: "transparent",
                [`.${buttonClasses.endIcon} svg`]: {
                  color: ({ palette }) => palette.gray[80],
                },
              },
              textTransform: "uppercase",
              fontSize: 11,
              fontWeight: 600,
              color: ({ palette }) =>
                displayProperties ? palette.common.black : palette.gray[50],
              [`.${buttonClasses.endIcon}`]: {
                marginLeft: 0.25,
                marginTop: -0.25,
                svg: {
                  color: ({ palette }) =>
                    displayProperties ? palette.common.black : palette.gray[50],
                  transition: ({ transitions }) =>
                    transitions.create(["transform", "color"]),
                  transform: `rotate(${displayProperties ? 0 : -90}deg)`,
                },
              },
            }}
          >
            Preview
          </Button>
        </Box>
        <DraftEntityProvenance entity={entity} createdAt={createdAt} />
      </Box>
      <Collapse in={displayProperties} mountOnEnter>
        <DraftEntityProperties initialEntity={entity} subgraph={subgraph} />
      </Collapse>
    </Box>
  );
};
