import { EntityType, VersionedUrl } from "@blockprotocol/graph";
import { Autocomplete, Button, Chip, MenuItem } from "@hashintel/design-system";
import { EntityTypeRootType, Subgraph } from "@local/hash-subgraph";
import { getRoots } from "@local/hash-subgraph/stdlib";
import {
  autocompleteClasses,
  Box,
  Checkbox,
  outlinedInputClasses,
  Stack,
  Typography,
} from "@mui/material";
import { useEffect, useMemo, useState } from "react";
import browser, { Tabs } from "webextension-polyfill";

import {
  GetEntityTypesQuery,
  GetEntityTypesQueryVariables,
} from "../../../../../graphql/api-types.gen";
import { getEntityTypesQuery } from "../../../../../graphql/queries/entity-type.queries";
import {
  GetSiteContentRequest,
  GetSiteContentReturn,
} from "../../../../../shared/messages";
import { queryGraphQlApi } from "../../../../../shared/query-graphql-api";
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
  ).then(({ data: { queryEntityTypes } }) => {
    return getRoots<EntityTypeRootType>(
      /**
       * Asserted for two reasons:
       * 1. Inconsistencies between Graph API and hash-subgraph types
       * 2. The function signature of getRoots asks for all fields on a subgraph, when it only needs roots and vertices
       * @todo fix this in the Block Protocol package and then hash-subgraph
       */
      queryEntityTypes as Subgraph<EntityTypeRootType>,
    ).map((typeWithMetadata) => typeWithMetadata.schema);
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
  setTargetEntityTypes: (types: EntityType[]) => void;
  targetEntityTypes: EntityType[];
};

export const SelectTypesAndInfer = ({
  activeTab,
  setTargetEntityTypes,
  targetEntityTypes,
}: SelectTypesAndInferProps) => {
  const [allEntityTypes, setAllEntityTypes] = useSessionStorage(
    "entityTypes",
    [],
  );
  const [selectOpen, setSelectOpen] = useState(false);
  const [inferenceRequests] = useSessionStorage("inferenceRequests", []);

  const [passiveInferenceConfig, setPassiveInferenceConfig] = useSessionStorage(
    "passiveInference",
    { conditions: [], enabled: false },
  );

  const pendingInferenceRequest = useMemo(
    () =>
      inferenceRequests.some(({ entityTypes, sourceUrl, status }) => {
        return (
          entityTypes.length === targetEntityTypes.length &&
          entityTypes.every((type) =>
            targetEntityTypes.some((targetType) => targetType.$id === type.$id),
          ) &&
          sourceUrl === activeTab?.url &&
          status === "pending"
        );
      }),
    [activeTab, inferenceRequests, targetEntityTypes],
  );

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

    const message: GetSiteContentRequest = {
      type: "get-site-content",
    };

    try {
      const siteContent = await (browser.tabs.sendMessage(
        activeTab.id,
        message,
      ) as Promise<GetSiteContentReturn>);

      void sendMessageToBackground({
        entityTypes: targetEntityTypes,
        sourceTitle: siteContent.pageTitle,
        sourceUrl: siteContent.pageUrl,
        textInput: siteContent.innerText,
        type: "infer-entities",
      });
    } catch (err) {
      alert(
        "Could not access page content – you may need to reload the tab if you just installed the extension, or it may be a page which your browser does not allow extensions to access.",
      );
    }
  };

  return (
    <Box
      component="form"
      onSubmit={(event) => {
        event.preventDefault();
        void inferEntitiesFromPage();
      }}
    >
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

      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        mt={1.5}
      >
        <Button
          disabled={pendingInferenceRequest || targetEntityTypes.length < 1}
          size="small"
          type="submit"
          sx={{ mt: 1 }}
        >
          {pendingInferenceRequest ? "Pending..." : "Suggest entities"}
        </Button>
        <Box>
          <Typography
            component="label"
            htmlFor="passive-inference-checkbox"
            sx={{
              mr: 1,
              color: ({ palette }) => palette.gray[90],
              fontSize: 14,
            }}
          >
            Run passively
          </Typography>
          <Checkbox
            id="passive-inference-checkbox"
            checked={passiveInferenceConfig.enabled}
            onChange={(event) => {
              setPassiveInferenceConfig({
                ...passiveInferenceConfig,
                enabled: event.target.checked,
              });
            }}
          />
        </Box>
      </Stack>
    </Box>
  );
};
