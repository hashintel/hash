import {
  ArrowUpRightRegularIcon,
  CaretDownSolidIcon,
  CircleCheckRegularIcon,
  IconButton,
} from "@hashintel/design-system";
import type { EntityUuid } from "@local/hash-graph-types/entity";
import { goalFlowDefinitionIds } from "@local/hash-isomorphic-utils/flows/goal-flow-definitions";
import type { FlowDefinition } from "@local/hash-isomorphic-utils/flows/types";
import { Box, Collapse, Stack, Typography } from "@mui/material";
import type { PropsWithChildren } from "react";
import { Fragment, useMemo, useState } from "react";

import type { FlowRun } from "../../../../graphql/api-types.gen";
import { Link } from "../../../../shared/ui/link";
import { useFlowRunsContext } from "../../../shared/flow-runs-context";
import { useFlowRunsUsage } from "../../../shared/use-flow-runs-usage";
import { SectionLabel } from "./section-label";
import { flowSectionBorderRadius } from "./shared/styles";
import type { FlowMaybeGrouped } from "./shared/types";
import { GroupStatus } from "./flow-run-sidebar/group-status";
import { Manager } from "./flow-run-sidebar/manager";

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
  flowDefinition: FlowDefinition;
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
  const { isUsageAvailable, usageByFlowRun } = useFlowRunsUsage({
    flowRunIds: [flowRunId],
  });
  const [showUsageBreakdown, setShowUsageBreakdown] = useState(false);

  const { selectedFlowRun } = useFlowRunsContext();

  const usage = usageByFlowRun[flowRunId];

  const nameParts = useMemo<{ text: string; url?: boolean }[]>(() => {
    const parts = name.split(/( )/g);
    const urlRegex = /^https?:\/\//;

    return parts.map((part) => ({
      text: part,
      url: urlRegex.test(part),
    }));
  }, [name]);

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
            sx={{ lineHeight: 1.2, mb: 0.7, wordBreak: "break-word" }}
          >
            {nameParts.map((part, index) =>
              part.url ? (
                // eslint-disable-next-line react/no-array-index-key
                <Link href={part.text} key={index} target="_blank">
                  {part.text}
                </Link>
              ) : (
                // eslint-disable-next-line react/no-array-index-key
                <Fragment key={index}>{part.text}</Fragment>
              ),
            )}
          </Typography>
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
      <Box sx={{ mt: 2 }}>
        <SectionLabel text="Manager" />
        <SidebarSection>
          <Manager />
        </SidebarSection>
      </Box>
      {isUsageAvailable && usage ? (
        <Box sx={{ mt: 2 }}>
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
