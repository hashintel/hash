import type { EntityUuid } from "@blockprotocol/type-system";
import {
  ArrowUpRightRegularIcon,
  CaretDownSolidIcon,
  IconButton,
} from "@hashintel/design-system";
import {
  goalFlowDefinitionIds,
  type GoalFlowTriggerInput,
} from "@local/hash-isomorphic-utils/flows/goal-flow-definitions";
import type {
  FlowActionDefinitionId,
  FlowDefinition,
} from "@local/hash-isomorphic-utils/flows/types";
import { Box, Collapse, Stack, Typography } from "@mui/material";
import type { PropsWithChildren } from "react";
import { useMemo, useState } from "react";

import type { FlowRun } from "../../../../../graphql/api-types.gen";
import { Link } from "../../../../../shared/ui/link";
import { useFlowRunsContext } from "../../../../shared/flow-runs-context";
import { useFlowRunsUsage } from "../../../../shared/use-flow-runs-usage";
import { GroupStatus } from "./flow-run-sidebar/group-status";
import { Manager } from "./flow-run-sidebar/manager";
import { SectionLabel } from "./section-label";
import { flowSectionBorderRadius } from "./shared/styles";
import type { FlowMaybeGrouped } from "./shared/types";

const SidebarSection = ({ children }: PropsWithChildren) => (
  <Box
    sx={({ palette }) => ({
      background: palette.common.white,
      border: `1px solid ${palette.gray[20]}`,
      borderRadius: flowSectionBorderRadius,
      px: 3,
      py: 2.5,
    })}
  >
    {children}
  </Box>
);

type FlowRunSidebarProps = {
  flowDefinition: FlowDefinition<FlowActionDefinitionId>;
  flowRunId: EntityUuid;
  groups: FlowMaybeGrouped["groups"];
  name: FlowRun["name"];
  showDag: () => void;
};

export const FlowRunSidebar = ({
  flowDefinition,
  flowRunId,
  groups,
  name,
  showDag,
}: FlowRunSidebarProps) => {
  const { selectedFlowRun } = useFlowRunsContext();

  const { isUsageAvailable, usageByFlowRun } = useFlowRunsUsage({
    flowRunIds: [flowRunId],
    pollInterval: selectedFlowRun?.closedAt ? 0 : 5_000,
  });

  const [showUsageBreakdown, setShowUsageBreakdown] = useState(false);
  const [showResearchPrompt, setShowResearchPrompt] = useState(false);

  const usage = usageByFlowRun[flowRunId];

  const nameParts = useMemo<{ text: string; url?: boolean }[]>(() => {
    const parts = name.split(/( )/g);
    const urlRegex = /^https?:\/\//;

    return parts.map((part) => ({
      text: part,
      url: urlRegex.test(part),
    }));
  }, [name]);

  const researchPrompt = selectedFlowRun?.inputs[0].flowTrigger.outputs?.find(
    (input) =>
      input.outputName === ("Research guidance" satisfies GoalFlowTriggerInput),
  )?.payload.value as string | undefined;

  return (
    <Box sx={{ ml: 3, minWidth: 320, width: 320 }}>
      <Box sx={{ mb: 2 }}>
        <SectionLabel
          text={
            goalFlowDefinitionIds.includes(flowDefinition.flowDefinitionId)
              ? "Goal"
              : "Description"
          }
        />
        <SidebarSection>
          <Typography
            component="p"
            variant="smallTextParagraphs"
            sx={{ lineHeight: 1.2, wordBreak: "break-word" }}
          >
            {nameParts.map((part, index) => (
              <Box
                component="span"
                // eslint-disable-next-line react/no-array-index-key
                key={index}
                sx={{ display: "inline-block", marginRight: "2px" }}
              >
                {part.url ? (
                  <Link href={part.text} target="_blank">
                    {part.text}
                  </Link>
                ) : (
                  part.text
                )}
                {index === nameParts.length - 1 && researchPrompt && (
                  <Box
                    aria-label="Show research prompt"
                    component="button"
                    onClick={() => setShowResearchPrompt(!showResearchPrompt)}
                    sx={{
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      display: "inline-block",
                      height: 12,
                      ml: 0.4,
                      p: 0,
                      top: 3,
                      position: "relative",
                      "&:hover svg": {
                        color: ({ palette }) => palette.common.black,
                      },
                    }}
                  >
                    <CaretDownSolidIcon
                      sx={{
                        color: ({ palette }) => palette.gray[50],
                        fontSize: 14,
                        transform: !showResearchPrompt
                          ? "rotate(-90deg)"
                          : "translateY(-1px)",
                        transition: ({ transitions }) =>
                          transitions.create("transform"),
                      }}
                    />
                  </Box>
                )}
              </Box>
            ))}
          </Typography>
          {researchPrompt && (
            <Collapse in={showResearchPrompt}>
              <Typography
                component="p"
                variant="smallTextParagraphs"
                sx={{ fontWeight: 300, lineHeight: 1.3, mt: 1 }}
              >
                “{researchPrompt}”
              </Typography>
            </Collapse>
          )}
        </SidebarSection>
      </Box>
      <Box>
        <Stack alignItems="center" direction="row">
          <SectionLabel text="Plan" />
          <IconButton
            onClick={() => showDag()}
            sx={{
              px: 0.3,
              py: 0,
              ml: 0.5,
              mb: 0.5,
              "& svg": { fontSize: 12 },
            }}
          >
            <Typography
              variant="smallCaps"
              sx={{ color: ({ palette }) => palette.blue[70] }}
            >
              View
            </Typography>
            <ArrowUpRightRegularIcon
              sx={{
                fill: ({ palette }) => palette.blue[70],
                ml: 0.3,
              }}
            />
          </IconButton>
        </Stack>
        <SidebarSection>
          <Box>
            {groups.map((groupData) => (
              <GroupStatus
                key={groupData.group?.groupId ?? "ungrouped"}
                groupData={groupData}
              />
            ))}
          </Box>
        </SidebarSection>
      </Box>

      <Box sx={{ my: 2 }}>
        <SectionLabel text="Manager" />
        <SidebarSection>
          <Manager />
        </SidebarSection>
      </Box>
      {isUsageAvailable && usage ? (
        <Box sx={{ mb: 2 }}>
          <SectionLabel text="Cost" />
          <SidebarSection>
            <Stack
              direction="row"
              alignItems="center"
              onClick={() => setShowUsageBreakdown(!showUsageBreakdown)}
              sx={{ cursor: "pointer" }}
            >
              <Typography
                variant="smallTextParagraphs"
                sx={{ color: ({ palette }) => palette.gray[80] }}
              >
                <Box component="span" fontWeight={500}>
                  Total:
                </Box>{" "}
                ${usage.total.toFixed(2)}
              </Typography>
              <CaretDownSolidIcon
                sx={{
                  color: ({ palette }) => palette.gray[50],
                  height: 14,
                  transform: !showUsageBreakdown
                    ? "rotate(-90deg)"
                    : "translateY(-1px)",
                  transition: ({ transitions }) =>
                    transitions.create("transform"),
                }}
              />
            </Stack>
            <Collapse in={showUsageBreakdown}>
              <Box
                sx={{
                  pb: 0.5,
                  mb: 0.5,
                  mt: 0.5,
                  borderBottom: ({ palette }) =>
                    `1px solid ${palette.gray[30]}`,
                }}
              >
                {usage.recordsByServiceFeature
                  .sort((a, b) => b.totalCostInUsd - a.totalCostInUsd)
                  .map((record) => (
                    <Box key={record.featureName}>
                      <Typography
                        variant="smallTextParagraphs"
                        sx={{ color: ({ palette }) => palette.gray[50] }}
                      >
                        <Box component="span" fontWeight={500}>
                          {record.featureName
                            .replace(/-(\b\d{4}[-]?\d{2}[-]?\d{2}\b)$/, "")
                            .trim()}
                          :
                        </Box>{" "}
                        ${record.totalCostInUsd.toFixed(2)}
                      </Typography>
                    </Box>
                  ))}
              </Box>
              <Box>
                {usage.recordsByTask
                  .sort((a, b) => b.totalCostInUsd - a.totalCostInUsd)
                  .map((record) => (
                    <Box key={record.taskName}>
                      <Typography
                        variant="smallTextParagraphs"
                        sx={{ color: ({ palette }) => palette.gray[50] }}
                      >
                        <Box component="span" fontWeight={500}>
                          {record.taskName}:
                        </Box>{" "}
                        ${record.totalCostInUsd.toFixed(2)}
                      </Typography>
                    </Box>
                  ))}
              </Box>
            </Collapse>
          </SidebarSection>
        </Box>
      ) : null}
    </Box>
  );
};
