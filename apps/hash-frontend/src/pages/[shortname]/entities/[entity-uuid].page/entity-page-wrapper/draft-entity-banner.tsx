import { FeatherRegularIcon } from "@hashintel/design-system";
import { Entity, EntityRootType, Subgraph } from "@local/hash-subgraph/.";
import { Box, Container, Typography } from "@mui/material";
import { useRouter } from "next/router";
import { FunctionComponent, useCallback } from "react";

import { ButtonProps } from "../../../../../shared/ui";
import { AcceptDraftEntityButton } from "../../../../shared/accept-draft-entity-button";
import { DiscardDraftEntityButton } from "../../../../shared/discard-draft-entity-button";

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
  setDraftEntity?: (entity: Entity) => void;
}> = ({
  draftEntity,
  draftEntitySubgraph,
  isModifyingEntity = false,
  setDraftEntity,
}) => {
  const router = useRouter();

  const handleDiscardedEntity = useCallback(() => {
    void router.push("/drafts");
  }, [router]);

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
          <strong>draft {draftEntity.linkData ? "link" : "entity"}</strong>
        </Typography>
        {isModifyingEntity ? (
          <Typography sx={{ fontSize: 14 }}>
            Save changes in order to discard or create this entity.
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
              onAcceptedEntity={setDraftEntity}
              variant="secondary"
              sx={buttonSx}
            >
              Create this {draftEntity.linkData ? "link" : "entity"}
            </AcceptDraftEntityButton>
          </Box>
        )}
      </Container>
    </Box>
  );
};
