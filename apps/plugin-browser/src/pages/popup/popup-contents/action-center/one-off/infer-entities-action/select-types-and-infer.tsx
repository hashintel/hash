import type { VersionedUrl } from "@blockprotocol/graph";
import { Autocomplete, Button, Chip, MenuItem } from "@hashintel/design-system";
import { EntityTypeWithMetadata } from "@local/hash-subgraph";
import {
  autocompleteClasses,
  Box,
  outlinedInputClasses,
  Typography,
} from "@mui/material";
import { useMemo, useState } from "react";
import browser, { Tabs } from "webextension-polyfill";

import {
  GetSiteContentRequest,
  GetSiteContentReturn,
} from "../../../../../../shared/messages";
import { sendMessageToBackground } from "../../../../../shared/messages";
import {
  darkModeBorderColor,
  darkModeInputBackgroundColor,
  darkModeInputColor,
  darkModePlaceholderColor,
} from "../../../../../shared/style-values";
import { useEntityTypes } from "../../../../../shared/use-entity-types";
import { useLocalStorage } from "../../../../../shared/use-local-storage";

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
  setTargetEntityTypes: (types: EntityTypeWithMetadata[]) => void;
  targetEntityTypes: EntityTypeWithMetadata[];
};

export const SelectTypesAndInfer = ({
  activeTab,
  setTargetEntityTypes,
  targetEntityTypes,
}: SelectTypesAndInferProps) => {
  const entityTypes = useEntityTypes();

  const [selectOpen, setSelectOpen] = useState(false);
  const [inferenceRequests] = useLocalStorage("inferenceRequests", []);

  const pendingInferenceRequest = useMemo(
    () =>
      inferenceRequests.some(
        ({ entityTypes: requestEntityTypes, sourceUrl, status }) => {
          return (
            requestEntityTypes.length === targetEntityTypes.length &&
            requestEntityTypes.every((type) =>
              targetEntityTypes.some(
                (targetType) => targetType.schema.$id === type.schema.$id,
              ),
            ) &&
            sourceUrl === activeTab?.url &&
            status === "pending"
          );
        },
      ),
    [activeTab, inferenceRequests, targetEntityTypes],
  );

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
        getOptionLabel={(option) =>
          `${option.schema.title}-${option.schema.$id}`
        }
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
        isOptionEqualToValue={(option, value) =>
          option.schema.$id === value.schema.$id
        }
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
        options={entityTypes}
        renderOption={(props, type) => (
          <MenuItem
            {...props}
            key={type.schema.$id}
            value={type.schema.$id}
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
              {type.schema.title}
            </Typography>
            <Chip
              color="blue"
              label={getChipLabelFromId(type.schema.$id)}
              sx={{ ml: 1, fontSize: 13 }}
            />
          </MenuItem>
        )}
        renderTags={(value, getTagProps) =>
          value.map((option, index) => (
            <Chip
              {...getTagProps({ index })}
              key={option.schema.$id}
              variant="outlined"
              label={option.schema.title}
            />
          ))
        }
        value={targetEntityTypes}
      />

      <Box mt={1.5}>
        <Button
          disabled={pendingInferenceRequest || targetEntityTypes.length < 1}
          size="small"
          type="submit"
          sx={{ mt: 1 }}
        >
          {pendingInferenceRequest ? "Pending..." : "Suggest entities"}
        </Button>
      </Box>
    </Box>
  );
};
