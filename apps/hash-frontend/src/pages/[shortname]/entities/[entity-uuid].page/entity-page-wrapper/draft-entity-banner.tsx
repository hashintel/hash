import { FeatherRegularIcon } from "@hashintel/design-system";
import type { Entity, EntityRootType, Subgraph } from "@local/hash-subgraph/.";
import { Box, Container, Typography } from "@mui/material";
import { useRouter } from "next/router";
import type { FunctionComponent } from "react";
import { useCallback } from "react";

import type { ButtonProps } from "../../../../../shared/ui";
import { Link } from "../../../../../shared/ui";
import { AcceptDraftEntityButton } from "../../../../shared/accept-draft-entity-button";
import { DiscardDraftEntityButton } from "../../../../shared/discard-draft-entity-button";
import { generateEntityHref } from "../../../../shared/use-entity-href";

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
  draftEntity: Entity;
  draftEntitySubgraph: Subgraph<EntityRootType>;
  isModifyingEntity?: boolean;
  onAcceptedEntity?: (entity: Entity) => void;
  owningShortname: string;
}> = ({
  draftEntity,
  draftEntitySubgraph,
  isModifyingEntity = false,
  onAcceptedEntity,
  owningShortname,
}) => {
  const router = useRouter();

  const handleDiscardedEntity = useCallback(() => {
    void router.push("/actions");
  }, [router]);

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
              : "new"}
            {draftEntity.linkData ? "link" : "entity"}
          </strong>
          {isUpdate && (
            <>
              <Box component="span"> –</Box>
              <Link
                href={generateEntityHref({
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
              draftEntity={draftEntity}
              draftEntitySubgraph={draftEntitySubgraph}
              onDiscardedEntity={handleDiscardedEntity}
              variant="secondary"
              sx={buttonSx}
            >
              Discard draft
            </DiscardDraftEntityButton>
            <AcceptDraftEntityButton
              draftEntity={draftEntity}
              draftEntitySubgraph={draftEntitySubgraph}
              onAcceptedEntity={onAcceptedEntity}
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
