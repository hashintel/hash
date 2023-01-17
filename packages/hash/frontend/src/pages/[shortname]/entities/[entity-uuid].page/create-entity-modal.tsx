import { VersionedUri } from "@blockprotocol/type-system";
import { Button } from "@hashintel/hash-design-system";
import { Entity } from "@hashintel/hash-subgraph";
import { getRoots } from "@hashintel/hash-subgraph/src/stdlib/roots";
import { Drawer, Stack, Typography } from "@mui/material";

import { EntityEditor } from "./entity-editor";
import { updateEntitySubgraphStateByEntity } from "./shared/update-entity-subgraph-state-by-entity";
import { useDraftEntitySubgraph } from "./shared/use-draft-entity-subgraph";

interface CreateEntityModalProps {
  open: boolean;
  onClose: () => void;
  entityTypeId: VersionedUri;
  onCreateEntity: (entity: Entity) => void;
}

export const CreateEntityModal = ({
  open,
  onClose,
  entityTypeId,
  onCreateEntity,
}: CreateEntityModalProps) => {
  const [draftEntitySubgraph, setDraftEntitySubgraph, loading] =
    useDraftEntitySubgraph(entityTypeId);

  if (loading) {
    return <div>Loading...</div>;
  }

  if (!draftEntitySubgraph) {
    return <div>Draft entity not defined</div>;
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      anchor="right"
      PaperProps={{
        sx: (theme) => ({
          p: 5,
          gap: 6.5,
          maxWidth: 1200,
          width: "calc(100vw - 200px)",
          [theme.breakpoints.down("md")]: {
            width: "100%",
          },
        }),
      }}
    >
      <Typography variant="h2" color="gray.90" fontWeight="bold">
        Create New Entity
      </Typography>

      <EntityEditor
        refetch={async () => {}}
        entitySubgraph={draftEntitySubgraph}
        setEntity={(entity) => {
          updateEntitySubgraphStateByEntity(entity, setDraftEntitySubgraph);
        }}
      />

      <Stack direction="row" gap={3}>
        <Button
          onClick={() => {
            const entity = getRoots(draftEntitySubgraph)[0];

            if (!entity) {
              return;
            }

            onCreateEntity(entity);
          }}
        >
          Create Entity
        </Button>
        <Button onClick={onClose} variant="tertiary">
          Cancel
        </Button>
      </Stack>
    </Drawer>
  );
};
