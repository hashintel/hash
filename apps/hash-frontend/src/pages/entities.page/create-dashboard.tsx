import { useMutation } from "@apollo/client";
import { Alert, Box, Stack } from "@mui/material";
import { useRouter } from "next/router";
import { useState } from "react";

import { extractEntityUuidFromEntityId } from "@blockprotocol/type-system";
import { TextField } from "@hashintel/design-system";
import {
  HashEntity,
  mergePropertyObjectAndMetadata,
} from "@local/hash-graph-sdk/entity";
import { systemEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";

import {
  createEntityMutation,
  querySidebarDashboardsQuery,
} from "../../graphql/queries/knowledge/entity.queries";
import { constructDashboardRelativeUrl } from "../../lib/routes";
import { PlusRegularIcon } from "../../shared/icons/plus-regular";
import { Button } from "../../shared/ui/button";
import { Modal } from "../../shared/ui/modal";
import { CreateButton } from "../shared/create-button";

import type {
  CreateEntityMutation,
  CreateEntityMutationVariables,
} from "../../graphql/api-types.gen";
import type { WebId } from "@blockprotocol/type-system";
import type {
  Dashboard,
  DashboardProperties,
} from "@local/hash-isomorphic-utils/system-types/dashboard";

export const CreateDashboard = ({ webId }: { webId: WebId }) => {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState(false);
  const [createEntity, { loading }] = useMutation<
    CreateEntityMutation,
    CreateEntityMutationVariables
  >(createEntityMutation, { refetchQueries: [querySidebarDashboardsQuery] });

  const closeAndClearForm = () => {
    setOpen(false);
    setTitle("");
    setDescription("");
    setError(false);
  };

  const close = () => {
    if (!loading) {
      closeAndClearForm();
    }
  };

  const createDashboard = async () => {
    if (!title.trim() || loading) {
      return;
    }

    setError(false);
    const properties: DashboardProperties = {
      "https://blockprotocol.org/@blockprotocol/types/property-type/name/":
        title.trim(),
      ...(description.trim() && {
        "https://blockprotocol.org/@blockprotocol/types/property-type/description/":
          description.trim(),
      }),
    };

    try {
      const { data } = await createEntity({
        variables: {
          entityTypeIds: [systemEntityTypes.dashboard.entityTypeId],
          webId,
          properties: mergePropertyObjectAndMetadata<Dashboard>(
            properties,
            undefined,
          ),
        },
      });

      if (!data?.createEntity) {
        setError(true);
        return;
      }

      const entity = new HashEntity(data.createEntity);
      closeAndClearForm();
      void router.push(
        constructDashboardRelativeUrl({
          dashboardEntityUuid: extractEntityUuidFromEntityId(
            entity.metadata.recordId.entityId,
          ),
        }),
      );
    } catch {
      setError(true);
    }
  };

  return (
    <>
      <CreateButton
        variant="tertiary_quiet"
        endIcon={<PlusRegularIcon />}
        onClick={() => setOpen(true)}
      >
        Create dashboard
      </CreateButton>
      <Modal open={open} onClose={close} header={{ title: "Create dashboard" }}>
        <Box
          component="form"
          sx={{ p: 3 }}
          onSubmit={(event) => {
            event.preventDefault();
            void createDashboard();
          }}
        >
          <Stack gap={2}>
            {error && (
              <Alert severity="error">
                Could not create the dashboard. Try again.
              </Alert>
            )}
            <TextField
              autoFocus
              label="Dashboard title"
              fullWidth
              required
              value={title}
              disabled={loading}
              onChange={(event) => setTitle(event.target.value)}
            />
            <TextField
              label="Description (optional)"
              fullWidth
              multiline
              rows={3}
              value={description}
              disabled={loading}
              onChange={(event) => setDescription(event.target.value)}
            />
            <Stack direction="row" spacing={1.5} justifyContent="flex-end">
              <Button variant="tertiary" onClick={close} disabled={loading}>
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                disabled={loading || !title.trim()}
              >
                {loading ? "Creating…" : "Create dashboard"}
              </Button>
            </Stack>
          </Stack>
        </Box>
      </Modal>
    </>
  );
};
