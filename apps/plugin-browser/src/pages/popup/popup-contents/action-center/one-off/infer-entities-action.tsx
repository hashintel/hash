import { Button } from "@hashintel/design-system";
import { Box, Collapse, Stack, Typography } from "@mui/material";
import { useMemo, useState } from "react";
import browser, { Tabs } from "webextension-polyfill";

import {
  GetSiteContentRequest,
  GetSiteContentReturn,
} from "../../../../../shared/messages";
import { LocalStorage } from "../../../../../shared/storage";
import { sendMessageToBackground } from "../../../../shared/messages";
import { borderColors } from "../../../../shared/style-values";
import { useLocalStorage } from "../../../../shared/use-local-storage";
import { Section } from "../shared/section";
import { SelectWebTarget } from "../shared/select-web-target";
import { CreateEntityIcon } from "./infer-entities-action/create-entity-icon";
import { EntityTypeSelector } from "./infer-entities-action/entity-type-selector";
import { InferenceRequests } from "./infer-entities-action/inference-requests";

export const InferEntitiesAction = ({
  activeTab,
  user,
}: {
  activeTab?: Tabs.Tab | null;
  user: NonNullable<LocalStorage["user"]>;
}) => {
  const [manualInferenceConfig, setManualInferenceConfig] = useLocalStorage(
    "manualInferenceConfig",
    {
      createAs: "draft",
      ownedById: user.webOwnedById,
      targetEntityTypeIds: [],
    },
  );

  const [showAdditionalConfig, setShowAdditionalConfig] = useState(false);

  const { createAs, ownedById, targetEntityTypeIds } = manualInferenceConfig;

  const [inferenceRequests] = useLocalStorage("inferenceRequests", []);

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
        ownedById,
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
              mb: 1.5,
            }}
          >
            <Typography sx={{ fontSize: 14, fontWeight: 600, mb: 1 }}>
              Scan for entities
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
        <Stack alignItems="center" direction="row">
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
              ml: 2,
              p: 0,
            }}
            type="button"
          >
            <Typography
              sx={{
                color: ({ palette }) => palette.gray[80],
                letterSpacing: 0.5,
                fontSize: 12,
              }}
            >
              Additional options
            </Typography>
          </Box>
        </Stack>
      </Box>
      <InferenceRequests />
    </Section>
  );
};
