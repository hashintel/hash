import type { EntityRootType, Subgraph } from "@blockprotocol/graph";
import type { ClosedMultiEntityType, Entity } from "@blockprotocol/type-system";
import { FeatherRegularIcon } from "@hashintel/design-system";
import type { HashEntity } from "@local/hash-graph-sdk/entity";
import { generateEntityPath } from "@local/hash-isomorphic-utils/frontend-paths";
import { Box, Container, Typography } from "@mui/material";
import type { FunctionComponent } from "react";

import type { ButtonProps } from "../../../shared/ui";
import { Link } from "../../../shared/ui";
import { AcceptDraftEntityButton } from "../accept-draft-entity-button";
import { DiscardDraftEntityButton } from "../discard-draft-entity-button";

const buttonSx: ButtonProps["sx"] = ({ palette }) => ({
  minWidth: 0,
  minHeight: 0,
  paddingY: 0.5,
  paddingX: 2,
  background: palette.common.white,
  borderColor: palette.gray[30],
  color: palette.common.black,
  fontWeight: 400,
  fontSize: 14,
  "&:hover": {
    background: palette.blue[20],
    borderColor: palette.blue[50],
    color: palette.blue[100],
    "& svg": {
      color: palette.blue[50],
    },
  },
});

export const DraftEntityBanner: FunctionComponent<{
  closedMultiEntityType: ClosedMultiEntityType;
  draftEntity: Entity;
  draftEntitySubgraph: Subgraph<EntityRootType<HashEntity>>;
  isModifyingEntity?: boolean;
  onDraftArchived: () => void;
  onDraftPublished: (entity: Entity) => void;
  owningShortname: string;
}> = ({
  closedMultiEntityType,
  draftEntity,
  draftEntitySubgraph,
  isModifyingEntity = false,
  onDraftArchived,
  onDraftPublished,
  owningShortname,
}) => {
  const isUpdate =
    !!draftEntity.metadata.provenance.firstNonDraftCreatedAtDecisionTime;

  return (
    <Box
      sx={({ palette }) => ({
        borderColor: palette.gray[20],
        borderWidth: 1,
        borderStyle: "solid",
        borderLeftWidth: 0,
        borderRightWidth: 0,
        background: palette.gray[10],
        minHeight: 50,
        display: "flex",
      })}
    >
      <Container
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          py: 1,
        }}
      >
        <Typography sx={{ fontSize: 14 }}>
          <FeatherRegularIcon
            sx={{
              fontSize: 14,
              position: "relative",
              top: 1,
              marginRight: 1.5,
              color: ({ palette }) => palette.gray[60],
            }}
          />
          This is a{" "}
          <strong>
            draft{" "}
            {isUpdate
              ? `update to ${draftEntity.linkData ? "a " : "an "}`
              : "new "}
            {draftEntity.linkData ? "link" : "entity"}
          </strong>
          {isUpdate && (
            <>
              <Box component="span"> –</Box>
              <Link
                href={generateEntityPath({
                  entityId: draftEntity.metadata.recordId.entityId,
                  includeDraftId: false,
                  shortname: owningShortname,
                })}
                sx={{ fontWeight: 600, ml: 0.5 }}
              >
                view live version
              </Link>
            </>
          )}
        </Typography>
        {isModifyingEntity ? (
          <Typography sx={{ fontSize: 14 }}>
            Save or discard changes to the draft before deciding its fate
          </Typography>
        ) : (
          <Box display="flex" gap={1.5}>
            <DiscardDraftEntityButton
              closedMultiEntityType={closedMultiEntityType}
              draftEntity={draftEntity}
              draftEntitySubgraph={draftEntitySubgraph}
              onDiscardedEntity={onDraftArchived}
              variant="secondary"
              sx={buttonSx}
            >
              Discard draft
            </DiscardDraftEntityButton>
            <AcceptDraftEntityButton
              closedMultiEntityType={closedMultiEntityType}
              draftEntity={draftEntity}
              draftEntitySubgraph={draftEntitySubgraph}
              onAcceptedEntity={onDraftPublished}
              variant="secondary"
              sx={buttonSx}
            >
              {isUpdate
                ? "Publish changes"
                : `Create this ${draftEntity.linkData ? "link" : "entity"}`}
            </AcceptDraftEntityButton>
          </Box>
        )}
      </Container>
    </Box>
  );
};
