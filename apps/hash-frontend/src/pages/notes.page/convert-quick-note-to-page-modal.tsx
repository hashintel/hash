import { Autocomplete, TextField } from "@hashintel/design-system";
import type { Entity } from "@local/hash-graph-sdk/entity";
import type { OwnedById } from "@local/hash-graph-types/web";
import {
  systemEntityTypes,
  systemLinkEntityTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";
import type { PageProperties } from "@local/hash-isomorphic-utils/system-types/page";
import type { ModalProps } from "@mui/material";
import {
  autocompleteClasses,
  Box,
  outlinedInputClasses,
  Typography,
} from "@mui/material";
import { generateKeyBetween } from "fractional-indexing";
import type { FunctionComponent } from "react";
import { useCallback, useMemo } from "react";
import { Controller, useForm } from "react-hook-form";

import { useBlockProtocolCreateEntity } from "../../components/hooks/block-protocol-functions/knowledge/use-block-protocol-create-entity";
import { useBlockProtocolUpdateEntity } from "../../components/hooks/block-protocol-functions/knowledge/use-block-protocol-update-entity";
import type { SimplePage } from "../../components/hooks/use-account-pages";
import { useAccountPages } from "../../components/hooks/use-account-pages";
import { PageIcon } from "../../components/page-icon";
import { Button, Modal } from "../../shared/ui";
import { useAuthenticatedUser } from "../shared/auth-info-context";

export type PageWithParentLink = SimplePage & {
  parentLinkEntity?: Entity;
};

type ConvertToPageFormData = {
  title?: string;
  parentPage?: SimplePage;
};

export const ConvertQuickNoteToPageModal: FunctionComponent<
  Omit<ModalProps, "children" | "onClose"> & {
    onClose: () => void;
    onConvertedToPage: (page: PageWithParentLink) => void;
    quickNoteEntity: Entity;
  }
> = ({ quickNoteEntity, onClose, onConvertedToPage, ...modalProps }) => {
  const { authenticatedUser } = useAuthenticatedUser();

  const { control, reset, handleSubmit, register, setValue } =
    useForm<ConvertToPageFormData>();

  const createdAt = useMemo(
    () => new Date(quickNoteEntity.metadata.provenance.createdAtDecisionTime),
    [quickNoteEntity],
  );

  const defaultTitle = `Quick Note - ${createdAt.toLocaleString()}`;

  const { data: pages } = useAccountPages(
    authenticatedUser.accountId as OwnedById,
  );

  const { updateEntity } = useBlockProtocolUpdateEntity();

  const { createEntity } = useBlockProtocolCreateEntity(
    authenticatedUser.accountId as OwnedById,
  );

  const innerSubmit = handleSubmit(async (data) => {
    const { parentPage } = data;

    const title = !data.title ? defaultTitle : data.title;

    const prevFractionalIndex =
      pages
        .filter((potentialSiblingPage) =>
          parentPage
            ? potentialSiblingPage.parentPage &&
              potentialSiblingPage.parentPage.metadata.recordId.entityId ===
                parentPage.metadata.recordId.entityId
            : !potentialSiblingPage.parentPage,
        )
        .map((sibling) => sibling.fractionalIndex)
        .sort()
        .slice(-1)[0] ?? null;

    const fractionalIndex = generateKeyBetween(prevFractionalIndex, null);

    const { data: pageEntity, errors } = await updateEntity({
      data: {
        entityId: quickNoteEntity.metadata.recordId.entityId,
        entityTypeId: systemEntityTypes.document.entityTypeId,
        properties: {
          "https://hash.ai/@hash/types/property-type/title/": title,
          "https://hash.ai/@hash/types/property-type/fractional-index/":
            fractionalIndex,
        } as PageProperties,
      },
    });

    if (!pageEntity || errors) {
      throw new Error("Failed to update quick note entity to page entity");
    }

    if (parentPage) {
      await createEntity({
        data: {
          entityTypeId: systemLinkEntityTypes.hasParent.linkEntityTypeId,
          properties: {},
          linkData: {
            leftEntityId: pageEntity.metadata.recordId.entityId,
            rightEntityId: parentPage.metadata.recordId.entityId,
          },
        },
      });
    }

    onConvertedToPage({
      archived: false,
      title,
      fractionalIndex,
      parentPage,
      type: "document",
      metadata: pageEntity.metadata,
    });
    onClose();
  });

  const handleDiscard = useCallback(() => {
    reset();
    onClose();
  }, [reset, onClose]);

  return (
    <Modal
      {...modalProps}
      sx={{
        "> div": {
          overflow: "hidden",
          padding: 0,
        },
      }}
      header={{
        title: "Convert note to page",
      }}
      onClose={onClose}
    >
      <Box>
        <Box
          component="form"
          onSubmit={innerSubmit}
          sx={{
            display: "flex",
            flexDirection: "column",
            rowGap: 3,
            padding: 3,
          }}
        >
          <TextField
            placeholder={defaultTitle}
            fullWidth
            label="Page title"
            {...register("title")}
          />
          <Controller
            control={control}
            name="parentPage"
            render={({ field }) => (
              <Autocomplete<SimplePage, false, false>
                value={field.value}
                isOptionEqualToValue={(option, value) =>
                  option.metadata.recordId.entityId ===
                  value.metadata.recordId.entityId
                }
                options={pages}
                getOptionLabel={(page) => page.title}
                inputLabel="Parent page"
                inputPlaceholder="Set a parent page..."
                onChange={(_, page) =>
                  setValue("parentPage", page ?? undefined)
                }
                autoFocus={false}
                renderOption={(props, page) => (
                  <Box component="li" {...props}>
                    <PageIcon
                      size="small"
                      icon={page.icon}
                      sx={{ marginRight: 1 }}
                    />
                    <Typography>{page.title}</Typography>
                  </Box>
                )}
                inputHeight={48}
                sx={{
                  [`&.${autocompleteClasses.hasClearIcon} .${outlinedInputClasses.root}`]:
                    {
                      paddingRight: 1,
                    },
                  [`.${outlinedInputClasses.root}`]: {
                    height: "unset",
                    paddingY: 1.5,
                    [`.${autocompleteClasses.input}`]: {
                      paddingY: 0,
                    },
                    svg: {
                      marginRight: 1,
                    },
                  },
                }}
              />
            )}
          />
          <Box display="flex" columnGap={1.25}>
            <Button type="submit">Convert to page</Button>
            <Button variant="tertiary" onClick={handleDiscard}>
              Cancel
            </Button>
          </Box>
        </Box>
      </Box>
    </Modal>
  );
};
