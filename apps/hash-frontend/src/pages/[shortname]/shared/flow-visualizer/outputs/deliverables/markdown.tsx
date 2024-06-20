import { CopyIconRegular } from "@hashintel/design-system";
import { Box, Stack, Tab, Typography } from "@mui/material";
import { useState } from "react";

import { PageIcon } from "../../../../../../components/page-icon";
import { Modal } from "../../../../../../shared/ui/modal";
import { Tabs } from "../../../../../../shared/ui/tabs";
import { useFlowRunsContext } from "../../../../../shared/flow-runs-context";
import { Markdown } from "../../../../../shared/markdown";
import { Pre } from "../../../../../shared/markdown/elements";
import type { DeliverableData } from "./shared/types";

export const MarkdownDeliverable = ({
  deliverable,
}: {
  deliverable: DeliverableData & { type: "markdown" };
}) => {
  const { displayName, markdown } = deliverable;
  const [showPreview, setShowPreview] = useState(false);

  const [selectedTab, setSelectedTab] = useState<"Preview" | "Markdown">(
    "Preview",
  );
  const [copyButtonText, setCopyButtonText] = useState("Copy as Markdown");

  const { selectedFlowRun } = useFlowRunsContext();

  return (
    <>
      <Modal
        contentStyle={{
          p: { xs: 0, md: 0 },
          width: { xs: "95%", md: 800, lg: 1000 },
        }}
        header={{
          hideBorder: true,
          subtitle: selectedFlowRun
            ? `This document was outputted as part of the ${selectedFlowRun.name} job`
            : "",
          sx: { pl: 3, pr: 1.5, pt: 1.5 },
          title: "Research report",
        }}
        open={showPreview}
        onClose={() => setShowPreview(false)}
      >
        <Box>
          <Stack
            direction="row"
            justifyContent="space-between"
            alignItems="center"
            sx={{
              borderBottom: ({ palette }) => `1px solid ${palette.gray[20]}`,
              px: 3,
            }}
          >
            <Stack direction="row">
              <Tabs
                onChange={(_event, newValue) => setSelectedTab(newValue)}
                sx={{ ml: -0.5 }}
                value={selectedTab}
              >
                <Tab
                  label={
                    <Typography
                      variant="smallTextLabels"
                      fontWeight={500}
                      sx={{
                        pb: 0.25,
                      }}
                    >
                      Preview
                    </Typography>
                  }
                  sx={{ pt: 0 }}
                  value="Preview"
                />
                <Tab
                  label={
                    <Typography
                      variant="smallTextLabels"
                      fontWeight={500}
                      sx={{
                        paddingY: 0.25,
                      }}
                    >
                      Markdown
                    </Typography>
                  }
                  sx={{ pt: 0 }}
                  value="Markdown"
                />
              </Tabs>
            </Stack>
            <Box
              component="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(markdown);
                  setCopyButtonText("Copied!");
                } catch {
                  setCopyButtonText("Couldn't copy");
                } finally {
                  setTimeout(
                    () => setCopyButtonText("Copy as Markdown"),
                    3_000,
                  );
                }
              }}
              sx={({ palette, transitions }) => ({
                alignItems: "center",
                background: "white",
                border: "none",
                cursor: "pointer",
                display: "flex",
                mb: 1.2,
                "&:hover": {
                  "& svg": {
                    fill: palette.blue[70],
                    transition: transitions.create("fill"),
                  },
                },
              })}
            >
              <Typography
                sx={({ palette, transitions }) => ({
                  color: palette.gray[70],
                  "&:hover": {
                    color: palette.blue[70],
                  },
                  fontWeight: 500,
                  transition: transitions.create("color"),
                })}
                variant="smallTextLabels"
              >
                {copyButtonText}
              </Typography>
              <CopyIconRegular
                sx={{
                  fill: ({ palette }) => palette.gray[70],
                  fontSize: 14,
                  ml: 1,
                }}
              />
            </Box>
          </Stack>
          <Box pt={3} pb={4} px={3}>
            {selectedTab === "Preview" ? (
              <Markdown markdown={markdown} />
            ) : (
              <Pre>
                <Box className="language-md">{markdown}</Box>
              </Pre>
            )}
          </Box>
        </Box>
      </Modal>

      <Stack
        direction="row"
        gap={1.5}
        sx={{ alignItems: "center", textAlign: "left" }}
      >
        <PageIcon
          sx={{
            fill: ({ palette }) => palette.gray[30],
            fontSize: 36,
          }}
        />
        <Box>
          <Typography
            component="div"
            variant="smallTextParagraphs"
            sx={{ fontWeight: 600, lineHeight: 1.3, mb: 0.5 }}
          >
            {displayName}
          </Typography>
          <Stack alignItems="center" direction="row" gap={1}>
            <Box
              component="button"
              onClick={() => setShowPreview(true)}
              sx={{ background: "none", border: "none", cursor: "pointer" }}
            >
              <Typography
                sx={{
                  display: "inline-block",
                  fontSize: 11,
                  fontWeight: 600,
                  color: ({ palette }) => palette.gray[60],
                  textTransform: "uppercase",
                }}
              >
                Open preview
              </Typography>
            </Box>
          </Stack>
        </Box>
      </Stack>
    </>
  );
};
