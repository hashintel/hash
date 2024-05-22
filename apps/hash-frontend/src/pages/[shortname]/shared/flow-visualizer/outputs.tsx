import { IconButton } from "@hashintel/design-system";
import { typedEntries } from "@local/advanced-types/typed-entries";
import type {
  PersistedEntity,
  ProposedEntity,
} from "@local/hash-isomorphic-utils/flows/types";
import type { SvgIconProps } from "@mui/material";
import { Box, Stack, Typography } from "@mui/material";
import type { FunctionComponent } from "react";
import { useMemo, useState } from "react";

import type { FlowRun } from "../../../../graphql/api-types.gen";
import { useFlowRunsContext } from "../../../shared/flow-runs-context";
import { getFileProperties } from "../../../shared/get-file-properties";
import type { DeliverableData } from "./outputs/deliverables";
import { Deliverables } from "./outputs/deliverables";
import { EntityResultTable } from "./outputs/entity-result-table";
import { PersistedEntityGraph } from "./outputs/persisted-entity-graph";
import { outputIcons } from "./outputs/shared/icons";
import { SectionLabel } from "./section-label";

export const getDeliverables = (
  outputs?: FlowRun["outputs"],
): DeliverableData[] => {
  const flowOutputs = outputs?.[0]?.contents?.[0]?.outputs;

  const deliverables: DeliverableData[] = [];

  for (const output of flowOutputs ?? []) {
    const { payload } = output;

    if (payload.kind === "PersistedEntity" && !Array.isArray(payload.value)) {
      const entity = payload.value.entity;

      if (!entity) {
        continue;
      }

      const { displayName, fileName, fileUrl } = getFileProperties(
        entity.properties,
      );

      if (fileUrl) {
        deliverables.push({
          displayName,
          entityTypeId: entity.metadata.entityTypeId,
          fileName,
          fileUrl,
          type: "file",
        });
      }
    }
  }

  return deliverables;
};

const VisibilityButton = ({
  active,
  label,
  Icon,
  onClick,
}: {
  active: boolean;
  label: string;
  Icon: FunctionComponent<SvgIconProps>;
  onClick: () => void;
}) => (
  <IconButton
    onClick={onClick}
    sx={({ palette }) => ({
      p: 0,
      svg: {
        fontSize: 15,
      },
      "&:hover": {
        background: "none",
        svg: {
          background: active ? palette.gray[20] : palette.blue[20],
          fill: active ? palette.gray[50] : palette.blue[70],
        },
        "> div": { background: active ? palette.gray[20] : palette.blue[20] },
        span: { color: active ? palette.gray[60] : palette.common.black },
      },
    })}
  >
    <Box
      sx={{
        background: ({ palette }) =>
          active ? palette.blue[20] : palette.gray[20],
        borderRadius: "50%",
        p: "4.5px",
        transition: ({ transitions }) => transitions.create("background"),
        width: 24,
        height: 24,
      }}
    >
      <Icon
        sx={({ palette }) => ({
          color: active ? palette.blue[70] : palette.gray[50],
          display: "block",
        })}
      />
    </Box>

    <Typography
      component="span"
      sx={{
        color: ({ palette }) =>
          active ? palette.common.black : palette.gray[60],
        fontSize: 13,
        fontWeight: 500,
        ml: 0.5,
        transition: ({ transitions }) => transitions.create("color"),
      }}
    >
      {label}
    </Typography>
  </IconButton>
);

type OutputsProps = {
  persistedEntities: PersistedEntity[];
  proposedEntities: ProposedEntity[];
};

type SectionVisibility = {
  deliverables: boolean;
  graph: boolean;
  table: boolean;
};

export const Outputs = ({
  persistedEntities,
  proposedEntities,
}: OutputsProps) => {
  const { selectedFlowRun } = useFlowRunsContext();

  const deliverables = useMemo(
    () => getDeliverables(selectedFlowRun?.outputs),
    [selectedFlowRun],
  );

  const [sectionVisibility, setSectionVisibility] = useState<SectionVisibility>(
    {
      table: true,
      graph: true,
      deliverables: true,
    },
  );

  return (
    <>
      <Stack alignItems="center" direction="row" gap={2} mb={0.5}>
        <SectionLabel text="Outputs" />
        {typedEntries(sectionVisibility).map(([section, visible]) => (
          <VisibilityButton
            key={section}
            label={`${section[0]!.toUpperCase()}${section.slice(1)}`}
            active={visible}
            Icon={outputIcons[section]}
            onClick={() =>
              setSectionVisibility((prev) => ({
                ...prev,
                [section]: !visible,
              }))
            }
          />
        ))}
      </Stack>
      <Stack
        alignItems="center"
        direction="row"
        flex={1}
        gap={1}
        sx={{
          maxWidth: "100%",
          overflowX: "auto",
        }}
      >
        {sectionVisibility.table && (
          <EntityResultTable
            persistedEntities={persistedEntities}
            proposedEntities={proposedEntities}
          />
        )}

        {sectionVisibility.graph && (
          <PersistedEntityGraph persistedEntities={persistedEntities} />
        )}

        {sectionVisibility.deliverables && (
          <Deliverables deliverables={deliverables} />
        )}
      </Stack>
    </>
  );
};
