import { EntityType, VersionedUrl } from "@blockprotocol/graph";
import { Autocomplete, Button, Chip, MenuItem } from "@hashintel/design-system";
import { getRoots } from "@local/hash-subgraph/stdlib";
import {
  autocompleteClasses,
  Box,
  outlinedInputClasses,
  Skeleton,
  Typography,
} from "@mui/material";
import { useEffect, useState } from "react";
import browser, { Tabs } from "webextension-polyfill";

import {
  GetEntityTypesQuery,
  GetEntityTypesQueryVariables,
} from "../../../../../graphql/api-types.gen";
import { getEntityTypesQuery } from "../../../../../graphql/queries/entity-type.queries";
import { GetSiteContentReturn, Message } from "../../../../../shared/messages";
import { queryGraphQlApi } from "../../../../../shared/query-graph-ql-api";
import { InferenceStatus } from "../../../../../shared/storage";
import {
  darkModeBorderColor,
  darkModeInputBackgroundColor,
  darkModeInputColor,
  darkModePlaceholderColor,
} from "../../../../shared/dark-mode-values";
import { sendMessageToBackground } from "../../../../shared/messages";
import { useSessionStorage } from "../../../../shared/use-storage-sync";

const getEntityTypes = () => {
  return queryGraphQlApi<GetEntityTypesQuery, GetEntityTypesQueryVariables>(
    getEntityTypesQuery,
  ).then(({ data }: { data: { queryEntityTypes } }) => {
    const subgraph = data.queryEntityTypes;
    return getRoots(subgraph).map(
      (typeWithMetadata) => typeWithMetadata.schema,
    );
  });
};

// This assumes a VersionedURL in the hash.ai/blockprotocol.org format
const getChipLabelFromId = (id: VersionedUrl) => {
  const url = new URL(id);
  const [_emptyString, namespace, _types, _entityType, typeSlug] =
    url.pathname.split("/");

  return `${
    url.origin !== FRONTEND_ORIGIN ? `${url.host} / ` : ""
  }${namespace} / ${typeSlug}`;
};

type SelectTypesAndInferProps = {
  activeTab?: Tabs.Tab | null;
  inferenceStatus: InferenceStatus;
  resetInferenceStatus: () => void;
  setTargetEntityTypes: (types: EntityType[]) => void;
  targetEntityTypes: EntityType[];
};

export const SelectTypesAndInfer = ({
  activeTab,
  inferenceStatus,
  resetInferenceStatus,
  setTargetEntityTypes,
  targetEntityTypes,
}: SelectTypesAndInferProps) => {
  const [allEntityTypes, setAllEntityTypes] = useSessionStorage(
    "entityTypes",
    [],
  );
  const [selectOpen, setSelectOpen] = useState(false);

  useEffect(() => {
    void getEntityTypes().then((entityTypes) => {
      setAllEntityTypes(
        entityTypes.sort((a, b) => a.title.localeCompare(b.title)),
      );
    });
  }, [setAllEntityTypes]);

  const inferEntitiesFromPage = async () => {
    if (!activeTab?.id) {
      throw new Error("No active tab");
    }

    const message: Message = {
      type: "get-site-content",
    };

    const siteContent = await (browser.tabs.sendMessage(
      activeTab.id,
      message,
    ) as Promise<GetSiteContentReturn>);

    void sendMessageToBackground({
      entityTypeIds: targetEntityTypes.map((type) => type.$id),
      sourceTitle: siteContent.pageTitle,
      sourceUrl: siteContent.pageUrl,
      textInput: siteContent.innerText,
      type: "infer-entities",
    });
  };

  return (
    <Box
      component="form"
      onSubmit={(event) => {
        event.preventDefault();
        void inferEntitiesFromPage();
      }}
    >
      {inferenceStatus.status === "error" ? (
        <Typography
          sx={{ color: ({ palette }) => palette.error.main, fontSize: 14 }}
        >
          {inferenceStatus.message}
        </Typography>
      ) : inferenceStatus.status === "pending" ? (
        <Skeleton variant="rectangular" height={54} sx={{ borderRadius: 1 }} />
      ) : (
        <Autocomplete
          autoFocus={false}
          componentsProps={{
            paper: {
              sx: {
                p: 0,
                "@media (prefers-color-scheme: dark)": {
                  background: darkModeInputBackgroundColor,
                  borderColor: darkModeBorderColor,
                },
              },
            },
            popper: { placement: "top" },
          }}
          getOptionLabel={(option) => `${option.title}-${option.$id}`}
          inputProps={{
            endAdornment: <div />,
            placeholder: "Search for types...",
            sx: () => ({
              height: "auto",
              "@media (prefers-color-scheme: dark)": {
                background: darkModeInputBackgroundColor,

                [`.${outlinedInputClasses.notchedOutline}`]: {
                  border: `1px solid ${darkModeBorderColor} !important`,
                },

                [`.${outlinedInputClasses.input}`]: {
                  color: darkModeInputColor,

                  "&::placeholder": {
                    color: `${darkModePlaceholderColor} !important`,
                  },
                },
              },
            }),
          }}
          isOptionEqualToValue={(option, value) => option.$id === value.$id}
          ListboxProps={{
            sx: {
              maxHeight: 240,
            },
          }}
          modifiers={[
            {
              name: "flip",
              enabled: false,
            },
          ]}
          multiple
          open={selectOpen}
          onChange={(_event, value) => {
            setTargetEntityTypes(value);
            setSelectOpen(false);
          }}
          onClose={() => setSelectOpen(false)}
          onOpen={() => setSelectOpen(true)}
          options={allEntityTypes}
          renderOption={(props, type) => (
            <MenuItem
              {...props}
              key={type.$id}
              value={type.$id}
              sx={({ palette }) => ({
                minHeight: 0,
                borderBottom: `1px solid ${palette.gray[20]}`,
                "@media (prefers-color-scheme: dark)": {
                  borderBottom: `1px solid ${darkModeBorderColor}`,

                  "&:hover": {
                    background: darkModeInputBackgroundColor,
                  },

                  [`&.${autocompleteClasses.option}`]: {
                    borderRadius: 0,
                    my: 0.25,

                    [`&[aria-selected="true"]`]: {
                      backgroundColor: `${palette.primary.main} !important`,
                      color: palette.common.white,
                    },

                    "&.Mui-focused": {
                      backgroundColor: `${palette.common.black} !important`,

                      [`&[aria-selected="true"]`]: {
                        backgroundColor: `${palette.primary.main} !important`,
                      },
                    },
                  },
                },
              })}
            >
              <Typography
                sx={{
                  fontSize: 14,
                  "@media (prefers-color-scheme: dark)": {
                    color: darkModeInputColor,
                  },
                }}
              >
                {type.title}
              </Typography>
              <Chip
                color="blue"
                label={getChipLabelFromId(type.$id)}
                sx={{ ml: 1, fontSize: 13 }}
              />
            </MenuItem>
          )}
          renderTags={(value, getTagProps) =>
            value.map((option, index) => (
              <Chip
                {...getTagProps({ index })}
                key={option.$id}
                variant="outlined"
                label={option.title}
              />
            ))
          }
          value={targetEntityTypes}
        />
      )}
      {inferenceStatus.status === "error" ? (
        <Button
          onClick={(event) => {
            event.preventDefault();
            resetInferenceStatus();
          }}
          type="button"
          sx={{ mt: 1.5 }}
        >
          Understood
        </Button>
      ) : (
        <Button
          disabled={
            inferenceStatus.status === "pending" || targetEntityTypes.length < 1
          }
          size="small"
          type="submit"
          sx={{ mt: 1.5 }}
        >
          {inferenceStatus.status === "pending"
            ? "Loading..."
            : "Suggest entities"}
        </Button>
      )}
    </Box>
  );
};
