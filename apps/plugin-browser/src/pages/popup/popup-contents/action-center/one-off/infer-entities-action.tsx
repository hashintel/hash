import { Button, CaretDownSolidIcon } from "@hashintel/design-system";
import { Box, Collapse, Stack, Typography } from "@mui/material";
import { useMemo, useState } from "react";
import browser, { Tabs } from "webextension-polyfill";

import { createDefaultSettings } from "../../../../../shared/create-default-settings";
import {
  GetSiteContentRequest,
  GetSiteContentReturn,
} from "../../../../../shared/messages";
import { LocalStorage } from "../../../../../shared/storage";
import { sendMessageToBackground } from "../../../../shared/messages";
import { borderColors } from "../../../../shared/style-values";
import { useStorageSync } from "../../../../shared/use-storage-sync";
import { EntityTypeSelector } from "../shared/entity-type-selector";
import { ModelSelector } from "../shared/model-selector";
import { Section } from "../shared/section";
import { SelectWebTarget } from "../shared/select-web-target";
import { ArrowUpToLineIcon } from "./infer-entities-action/arrow-up-to-line-icon";
import { CreateEntityIcon } from "./infer-entities-action/create-entity-icon";

export const InferEntitiesAction = ({
  activeTab,
  user,
}: {
  activeTab?: Tabs.Tab | null;
  user: NonNullable<LocalStorage["user"]>;
}) => {
  const [manualInferenceConfig, setManualInferenceConfig] = useStorageSync(
    "manualInferenceConfig",
    createDefaultSettings({ userWebOwnedById: user.webOwnedById })
      .manualInferenceConfig,
  );

  const [showAdditionalConfig, setShowAdditionalConfig] = useState(false);

  const { createAs, model, ownedById, targetEntityTypeIds } =
    manualInferenceConfig;

  const [inferenceRequests] = useStorageSync("inferenceRequests", []);

  const pendingInferenceRequest = useMemo(
    () =>
      inferenceRequests.some(
        ({ entityTypeIds: requestEntityTypes, sourceUrl, status }) => {
          return (
            requestEntityTypes.length === targetEntityTypeIds.length &&
            requestEntityTypes.every((versionedUrl) =>
              targetEntityTypeIds.some(
                (targetTypeId) => targetTypeId === versionedUrl,
              ),
            ) &&
            sourceUrl === activeTab?.url &&
            status === "pending"
          );
        },
      ),
    [activeTab, inferenceRequests, targetEntityTypeIds],
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
        createAs,
        entityTypeIds: targetEntityTypeIds,
        model,
        ownedById,
        sourceTitle: siteContent.pageTitle,
        sourceUrl: siteContent.pageUrl,
        textInput: siteContent.innerText,
        type: "infer-entities",
      });
    } catch (err) {
      // eslint-disable-next-line no-alert
      alert(
        "Could not access page content – you may need to reload the tab if you just installed the extension, or it may be a page which your browser does not allow extensions to access.",
      );
    }
  };

  return (
    <Section
      HeaderIcon={CreateEntityIcon}
      headerText="Create entities from page"
      linkHref="https://app.hash.ai/entities"
      linkText="View entities"
    >
      <Box
        component="form"
        onSubmit={(event) => {
          event.preventDefault();
          void inferEntitiesFromPage();
        }}
      >
        <Box mb={1.5}>
          <EntityTypeSelector
            inputHeight="auto"
            multiple
            setTargetEntityTypeIds={(newTargetIds) =>
              setManualInferenceConfig({
                ...manualInferenceConfig,
                targetEntityTypeIds: newTargetIds,
              })
            }
            targetEntityTypeIds={targetEntityTypeIds}
          />
        </Box>
        <Collapse in={showAdditionalConfig}>
          <Box
            sx={{
              padding: 2,
              borderRadius: 1,
              borderStyle: "solid",
              borderWidth: 1,
              ...borderColors,
            }}
          >
            <Typography sx={{ fontSize: 14, fontWeight: 600, pb: 1 }}>
              Choose inference engine to use
            </Typography>
            <ModelSelector
              selectedModel={model}
              setSelectedModel={(newModel) =>
                setManualInferenceConfig({
                  ...manualInferenceConfig,
                  model: newModel,
                })
              }
            />

            <Typography sx={{ fontSize: 14, fontWeight: 600, pb: 1, pt: 2 }}>
              When entities are found...
            </Typography>
            <SelectWebTarget
              createAs={createAs}
              setCreateAs={(newCreateAs) =>
                setManualInferenceConfig({
                  ...manualInferenceConfig,
                  createAs: newCreateAs,
                })
              }
              ownedById={ownedById}
              setOwnedById={(newOwnedById) =>
                setManualInferenceConfig({
                  ...manualInferenceConfig,
                  ownedById: newOwnedById,
                })
              }
              user={user}
            />
          </Box>
        </Collapse>
        <Stack alignItems="center" direction="row" mt={1.5}>
          <Button
            disabled={pendingInferenceRequest || targetEntityTypeIds.length < 1}
            size="small"
            type="submit"
          >
            {pendingInferenceRequest ? "Pending..." : "Suggest entities"}
          </Button>
          <Box
            component="button"
            onClick={() => setShowAdditionalConfig(!showAdditionalConfig)}
            sx={{
              background: "none",
              border: "none",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              ml: 2,
              p: 0,
            }}
            type="button"
          >
            <Typography
              sx={{
                color: ({ palette }) => palette.gray[80],
                letterSpacing: 0.5,
                fontSize: 14,
                "@media (prefers-color-scheme: dark)": {
                  color: ({ palette }) => palette.gray[40],
                },
              }}
            >
              Additional options
            </Typography>
            {showAdditionalConfig ? (
              <ArrowUpToLineIcon
                sx={{
                  fontSize: 9,
                  ml: 0.8,
                  fill: ({ palette }) => palette.gray[50],
                }}
              />
            ) : (
              <CaretDownSolidIcon
                sx={{
                  fontSize: 11,
                  ml: 0.5,
                  fill: ({ palette }) => palette.gray[50],
                  transform: "rotate(270deg)",
                }}
              />
            )}
          </Box>
        </Stack>
      </Box>
    </Section>
  );
};
