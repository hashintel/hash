import { useMutation } from "@apollo/client";
import type { EntityUuid } from "@blockprotocol/type-system";
import {
  AngleRightRegularIcon,
  PlaySolidIcon,
  Select,
  StopSolidIcon,
} from "@hashintel/design-system";
import {
  generateFlowDefinitionPath,
  generateWorkerRunPath,
} from "@local/hash-isomorphic-utils/flows/frontend-paths";
import type { SvgIconProps, SxProps, Theme } from "@mui/material";
import {
  Box,
  CircularProgress,
  outlinedInputClasses,
  Stack,
  Typography,
} from "@mui/material";
import { format } from "date-fns";
import { useRouter } from "next/router";
import type { FunctionComponent } from "react";
import { useCallback, useMemo, useState } from "react";

import { useGetOwnerForEntity } from "../../../../../components/hooks/use-get-owner-for-entity";
import type {
  CancelFlowMutation,
  CancelFlowMutationVariables,
  FlowRun,
} from "../../../../../graphql/api-types.gen";
import { cancelFlowMutation } from "../../../../../graphql/queries/knowledge/flow.queries";
import { BoltLightIcon } from "../../../../../shared/icons/bolt-light-icon";
import { Button } from "../../../../../shared/ui/button";
import { Link } from "../../../../../shared/ui/link";
import { MenuItem } from "../../../../../shared/ui/menu-item";
import { useFlowDefinitionsContext } from "../../../../shared/flow-definitions-context";
import { useFlowRunsContext } from "../../../../shared/flow-runs-context";

const typographySx: SxProps<Theme> = {
  color: ({ palette }) => palette.gray[70],
  fontWeight: 500,
  lineHeight: 1,
};

const selectSx: SxProps<Theme> = {
  background: "transparent",
  boxShadow: "none",
  [`& .${outlinedInputClasses.input}`]: {
    fontSize: 14,
    padding: "6px 12px",
    ...typographySx,
  },
  "& svg": {
    fontSize: 14,
  },
};

const Divider = ({ topOffset }: { topOffset?: number }) => (
  <AngleRightRegularIcon
    sx={{
      fill: ({ palette }) => palette.gray[50],
      fontSize: 18,
      mr: 0.5,
      ml: 1,
      mt: topOffset ?? 0,
    }}
  />
);

export const topbarHeight = 50;

const generateRunLabel = (run: Pick<FlowRun, "closedAt">) =>
  `Run ${
    run.closedAt
      ? ` – ${format(new Date(run.closedAt), "yyyy-MM-dd h:mm a")}`
      : " – in progress"
  }`;

const TopbarButton = ({
  background,
  Icon,
  onClick,
  pending,
  text,
}: {
  background: "blue" | "black";
  Icon: FunctionComponent<SvgIconProps>;
  onClick: () => void;
  pending: boolean;
  text: string;
}) => {
  return (
    <Button
      disabled={pending}
      onClick={onClick}
      size="xs"
      sx={({ palette, transitions }) => ({
        background:
          background === "black" ? palette.common.black : palette.blue[70],
        pl: "14px",
        pr: 2,
        "&:disabled": {
          background: palette.gray[50],
        },
        "&:before": { background: "transparent" },
        "&:hover": {
          background: background === "black" ? palette.red[80] : undefined,
        },
        "&:hover svg": {
          color: palette.common.white,
          fill: palette.common.white,
        },
        transition: transitions.create("background"),
      })}
    >
      {pending ? (
        <CircularProgress
          size={14}
          sx={{
            color: ({ palette }) => palette.common.white,
            mr: 1,
          }}
          thickness={5}
          variant="indeterminate"
        />
      ) : (
        <Icon
          sx={{
            fill: ({ palette }) =>
              background === "black" ? palette.gray[70] : palette.blue[30],
            fontSize: 14,
            mr: 1,
            transition: ({ transitions }) => transitions.create("fill"),
          }}
        />
      )}
      <Typography
        sx={{
          color: ({ palette }) => palette.common.white,
          fontSize: 13,
          fontWeight: 600,
        }}
      >
        {text}
      </Typography>
    </Button>
  );
};

export const Topbar = ({
  handleRunFlowClicked,
  readonly,
  showRunButton,
  startFlowPending,
  workerType,
}: {
  handleRunFlowClicked: () => void;
  readonly?: boolean;
  showRunButton: boolean;
  startFlowPending: boolean;
  workerType: "goal" | "flow";
}) => {
  const { push } = useRouter();

  const [cancelling, setCancelling] = useState(false);

  const { flowDefinitions, selectedFlowDefinitionId } =
    useFlowDefinitionsContext();

  const { flowRuns, selectedFlowRunId, selectedFlowRun } = useFlowRunsContext();

  const [cancelFlow] = useMutation<
    CancelFlowMutation,
    CancelFlowMutationVariables
  >(cancelFlowMutation);

  const onCancelFlowClicked = useCallback(async () => {
    if (selectedFlowRunId) {
      setCancelling(true);

      try {
        await cancelFlow({ variables: { flowUuid: selectedFlowRunId } });
      } catch {
        /**
         * We don't nee to worry about the success case because the cancel flow button will disappear
         */
        setCancelling(false);
      }
    }
  }, [cancelFlow, selectedFlowRunId]);

  const onRunFlowClicked = useCallback(() => {
    handleRunFlowClicked();
  }, [handleRunFlowClicked]);

  const getOwner = useGetOwnerForEntity();

  const runOptions = useMemo(
    () =>
      flowRuns.filter(
        (run) => run.flowDefinitionId === selectedFlowDefinitionId,
      ),
    [flowRuns, selectedFlowDefinitionId],
  );

  const selectedFlowDefinition = flowDefinitions.find(
    (flow) => flow.flowDefinitionId === selectedFlowDefinitionId,
  );

  return (
    <Stack
      alignItems="center"
      direction="row"
      justifyContent="space-between"
      sx={({ palette }) => ({
        borderBottom: `1px solid ${palette.gray[20]}`,
        height: topbarHeight,
        px: 3,
        width: "100%",
      })}
    >
      <Stack direction="row" alignItems="center">
        <BoltLightIcon
          sx={{
            fill: ({ palette }) => palette.gray[60],
            fontSize: 14,
            mr: 0.8,
          }}
        />
        <Link href="/workers" noLinkStyle>
          <Typography sx={typographySx} variant="smallTextParagraphs">
            Agents
          </Typography>
        </Link>
        <Divider topOffset={0.1} />

        <Link href={`/${workerType}`} noLinkStyle sx={{ mr: 0.5 }}>
          <Typography
            sx={{ ...typographySx, textTransform: "capitalize" }}
            variant="smallTextParagraphs"
          >
            {`${workerType}s`}
          </Typography>
        </Link>
        <Divider topOffset={0.1} />
        <Box mr={1}>
          {readonly ? (
            <Typography sx={typographySx} variant="smallTextParagraphs">
              {selectedFlowDefinition?.name}
            </Typography>
          ) : (
            <Select
              selectSx={selectSx}
              value={selectedFlowDefinitionId ?? "none"}
              onChange={(event) => {
                /**
                 * @todo update this to use the flow definition's uuid when stored in the db
                 *    also then needs to take account of the correct namespace, which might be different from the
                 *   current
                 */
                void push(
                  generateFlowDefinitionPath({
                    shortname: "hash",
                    flowDefinitionId: event.target.value,
                  }),
                );
              }}
            >
              {flowDefinitions.map((flow) => (
                <MenuItem
                  key={flow.flowDefinitionId}
                  value={flow.flowDefinitionId}
                >
                  {flow.name}
                </MenuItem>
              ))}
            </Select>
          )}
        </Box>
        {runOptions.length > 0 && (
          <>
            <Divider />
            {readonly && selectedFlowRun ? (
              <Typography sx={typographySx} variant="smallTextParagraphs">
                {generateRunLabel(selectedFlowRun)}
              </Typography>
            ) : (
              <Select
                selectSx={{ ...selectSx, minWidth: 100 }}
                value={selectedFlowRunId ?? "none"}
                onChange={(event) => {
                  const value = event.target.value;

                  if (value === "none") {
                    void push(
                      generateFlowDefinitionPath({
                        shortname: "hash",
                        flowDefinitionId: selectedFlowDefinitionId ?? "none",
                      }),
                    );
                    return;
                  }

                  const flowRun = flowRuns.find(
                    (run) => run.flowRunId === value,
                  );
                  if (!flowRun) {
                    throw new Error(`Flow run with id ${value} not found`);
                  }

                  const { shortname } = getOwner({ webId: flowRun.webId });

                  void push(
                    generateWorkerRunPath({
                      shortname,
                      flowRunId: value as EntityUuid,
                    }),
                  );
                }}
              >
                <MenuItem selected value="none">
                  Definition
                </MenuItem>
                {runOptions.map((run) => (
                  <MenuItem
                    key={run.flowRunId}
                    value={run.flowRunId}
                    sx={{ fontFamily: "monospace" }}
                  >
                    {generateRunLabel(run)}
                  </MenuItem>
                ))}
              </Select>
            )}
          </>
        )}
      </Stack>
      {selectedFlowRun && !selectedFlowRun.closedAt ? (
        <TopbarButton
          background="black"
          Icon={StopSolidIcon}
          onClick={onCancelFlowClicked}
          pending={cancelling}
          text="Stop"
        />
      ) : showRunButton ? (
        <TopbarButton
          background="blue"
          Icon={PlaySolidIcon}
          onClick={onRunFlowClicked}
          pending={startFlowPending}
          text={selectedFlowRun ? "Re-run" : "Run"}
        />
      ) : null}
    </Stack>
  );
};
