import {
  ArrowDownIconRegular,
  ArrowRightIconRegular,
  AsteriskRegularIcon,
  ClockIconRegular,
} from "@hashintel/design-system";
import {
  currentTimeInstantTemporalAxes,
  generateVersionedUrlMatchingFilter,
  mapGqlSubgraphFieldsFragmentToSubgraph,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import { systemEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import { simplifyProperties } from "@local/hash-isomorphic-utils/simplify-properties";
import type { UsageRecordProperties } from "@local/hash-isomorphic-utils/system-types/usagerecord";
import type { EntityRootType } from "@local/hash-subgraph";
import { getRoots } from "@local/hash-subgraph/stdlib";
import type { SvgIconProps } from "@mui/material";
import { Stack } from "@mui/material";
import { formatDuration, intervalToDuration } from "date-fns";
import type { FunctionComponent } from "react";
import { useEffect, useState } from "react";

import type {
  GetEntitySubgraphQuery,
  GetEntitySubgraphQueryVariables,
} from "../../../../../../../graphql/api-types.gen";
import { getEntitySubgraphQuery } from "../../../../../../../graphql/queries/entity.queries";
import { queryGraphQlApi } from "../../../../../../../shared/query-graphql-api";
import type { MinimalFlowRun } from "../../../../../../../shared/storage";
import { iconSx } from "./styles";

const MetadataItem = ({
  marginRight = 0.6,
  text,
  Icon,
}: {
  marginRight?: number;
  text: string;
  Icon: FunctionComponent<SvgIconProps>;
}) => (
  <Stack direction="row" alignItems="center">
    <Icon sx={{ ...iconSx, mr: marginRight }} />
    {text}
  </Stack>
);

type TotalUsage = {
  inputTokens: number;
  outputTokens: number;
};

const getTotalUsage = ({ flowRunId }: { flowRunId: string }) =>
  queryGraphQlApi<GetEntitySubgraphQuery, GetEntitySubgraphQueryVariables>(
    getEntitySubgraphQuery,
    {
      request: {
        filter: {
          all: [
            generateVersionedUrlMatchingFilter(
              systemEntityTypes.usageRecord.entityTypeId,
              { ignoreParents: true },
            ),
            {
              equal: [
                { path: ["outgoingLinks", "rightEntity", "uuid"] },
                {
                  parameter: flowRunId,
                },
              ],
            },
          ],
        },
        graphResolveDepths: zeroedGraphResolveDepths,
        includeDrafts: false,
        temporalAxes: currentTimeInstantTemporalAxes,
      },
    },
  ).then(({ data }) => {
    const subgraph = mapGqlSubgraphFieldsFragmentToSubgraph<EntityRootType>(
      data.getEntitySubgraph.subgraph,
    );

    const usageRecords = getRoots(subgraph);

    let inputTokens: number = 0;
    let outputTokens: number = 0;
    for (const record of usageRecords) {
      const { inputUnitCount, outputUnitCount } =
        simplifyProperties<UsageRecordProperties>(record.properties);
      inputTokens += inputUnitCount ?? 0;
      outputTokens += outputUnitCount ?? 0;
    }

    return {
      inputTokens,
      outputTokens,
    };
  });

const generateDurationString = ({
  executedAt,
  closedAt,
}: {
  executedAt: string;
  closedAt?: string | null;
}) =>
  formatDuration(
    intervalToDuration({
      start: new Date(executedAt),
      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- we don't want an empty string
      end: new Date(closedAt || Date.now()),
    }),
  );

export const FlowMetadataCellContents = ({
  flowRun,
  visible,
}: {
  flowRun: MinimalFlowRun;
  visible: boolean;
}) => {
  const [usage, setUsage] = useState<TotalUsage | null>(null);

  const { executedAt, closedAt } = flowRun;

  const [timeElapsed, setTimeElapsed] = useState(() =>
    executedAt
      ? generateDurationString({ executedAt, closedAt })
      : "Pending...",
  );

  useEffect(() => {});

  useEffect(() => {
    if (visible && executedAt) {
      const timeElapsedNow = generateDurationString({ executedAt, closedAt });

      /**
       * Stop the interval if we have a closedAt time and we've already calculated the final elapsed duration
       */
      if (!closedAt || timeElapsed !== timeElapsedNow) {
        setTimeout(() => {
          setTimeElapsed(
            generateDurationString({
              executedAt,
              closedAt,
            }),
          );
        }, 1_000);
      }
    }
  });

  useEffect(() => {
    if (visible) {
      /**
       * This will continue to fetch usage on a 10 second interval even after the run has closed,
       * but we only do it when (a) the popup is open, and (b) this metadata section expanded,
       * and it guarantees that any usage records that somehow hit the db after the run is closed
       * are accounted for.
       */
      const interval = setInterval(() => {
        void getTotalUsage({ flowRunId: flowRun.flowRunId }).then(setUsage);
      }, 10_000);

      return () => clearInterval(interval);
    }
  }, [flowRun.flowRunId, visible]);

  useEffect(() => {
    if (visible) {
      void getTotalUsage({ flowRunId: flowRun.flowRunId }).then(setUsage);
    }
  }, [flowRun.flowRunId, visible]);

  return (
    <Stack
      alignItems="center"
      direction="row"
      gap={2}
      p="10px 16px"
      sx={({ palette }) => ({
        color: palette.gray[80],
        fontSize: 12,
        "@media (prefers-color-scheme: dark)": {
          color: palette.gray[40],
        },
      })}
    >
      <MetadataItem
        marginRight={0.8}
        text={timeElapsed}
        Icon={ClockIconRegular}
      />
      {usage && (
        <>
          <MetadataItem
            text={`${usage.inputTokens} input tokens`}
            Icon={ArrowDownIconRegular}
          />
          <MetadataItem
            text={`${usage.outputTokens} output tokens`}
            Icon={ArrowRightIconRegular}
          />
        </>
      )}
      {flowRun.persistedEntities.length > 0 && (
        <MetadataItem
          text={`${flowRun.persistedEntities.length} entities`}
          Icon={AsteriskRegularIcon}
        />
      )}
    </Stack>
  );
};
