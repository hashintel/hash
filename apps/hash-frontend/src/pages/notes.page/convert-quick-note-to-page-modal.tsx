import {
  Autocomplete,
  IconButton,
  Modal,
  TextField,
} from "@hashintel/design-system";
import { types } from "@local/hash-isomorphic-utils/ontology-types";
import { Entity, OwnedById } from "@local/hash-subgraph";
import { extractBaseUrl } from "@local/hash-subgraph/type-system-patch";
import {
  autocompleteClasses,
  Box,
  Divider,
  ModalProps,
  outlinedInputClasses,
  Typography,
} from "@mui/material";
import { generateKeyBetween } from "fractional-indexing";
import { FunctionComponent, useCallback } from "react";
import { Controller, useForm } from "react-hook-form";

import { useBlockProtocolCreateEntity } from "../../components/hooks/block-protocol-functions/knowledge/use-block-protocol-create-entity";
import { useBlockProtocolUpdateEntity } from "../../components/hooks/block-protocol-functions/knowledge/use-block-protocol-update-entity";
import { useAccountPages } from "../../components/hooks/use-account-pages";
import { PageIcon } from "../../components/page-icon";
import { XMarkRegularIcon } from "../../shared/icons/x-mark-regular-icon";
import { Button } from "../../shared/ui";
import { useAuthenticatedUser } from "../shared/auth-info-context";
import { QuickNoteEntityWithCreatedAt } from "./types";

export type PageWithParentLink = Page & { parentLinkEntity?: Entity };

type ConvertToPageFormData = {
  title?: string;
  parentPage?: Page;
};

export const ConvertQuickNoteToPageModal: FunctionComponent<
  Omit<ModalProps, "children" | "onClose"> & {
    onClose: () => void;
    onConvertedToPage: (page: PageWithParentLink) => void;
    quickNoteEntityWithCreatedAt: QuickNoteEntityWithCreatedAt;
  }
> = ({
  quickNoteEntityWithCreatedAt,
  onClose,
  onConvertedToPage,
  ...modalProps
}) => {
  const { authenticatedUser } = useAuthenticatedUser();

  const { control, reset, handleSubmit, register, setValue } =
    useForm<ConvertToPageFormData>();

  const defaultTitle = `Quick Note - ${quickNoteEntityWithCreatedAt.createdAt.toLocaleString()}`;

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
        entityId:
          quickNoteEntityWithCreatedAt.quickNoteEntity.metadata.recordId
            .entityId,
        entityTypeId: types.entityType.page.entityTypeId,
        properties: {
          [extractBaseUrl(types.propertyType.title.propertyTypeId)]: title,
          [extractBaseUrl(types.propertyType.fractionalIndex.propertyTypeId)]:
            fractionalIndex,
        },
      },
    });

    if (!pageEntity || errors) {
      throw new Error("Failed to update quick note entity to page entity");
    }

    if (parentPage) {
      await createEntity({
        data: {
          entityTypeId: types.linkEntityType.parent.linkEntityTypeId,
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
      ...pageEntity,
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
      onClose={onClose}
    >
      <Box>
        <Box
          sx={{
            paddingX: 3,
            paddingTop: 2,
            paddingBottom: 1.5,
            position: "relative",
          }}
        >
          <Typography
            sx={{
              fontSize: 16,
              fontWeight: 500,
              color: ({ palette }) => palette.gray[80],
            }}
          >
            Convert note to page
          </Typography>
          <IconButton
            onClick={onClose}
            sx={{
              position: "absolute",
              top: ({ spacing }) => spacing(1),
              right: ({ spacing }) => spacing(1),
            }}
          >
            <XMarkRegularIcon />
          </IconButton>
        </Box>
        <Divider sx={{ borderColor: ({ palette }) => palette.gray[20] }} />
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
              <Autocomplete<Page, false, false>
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
