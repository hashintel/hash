import { useQuery } from "@apollo/client";
import { EditableField } from "@hashintel/block-design-system";
import {
  currentTimeInstantTemporalAxes,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import { systemEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import { Stack } from "@mui/material";

import type {
  GetEntitySubgraphQuery,
  GetEntitySubgraphQueryVariables,
} from "../../../graphql/api-types.gen";
import { getEntitySubgraphQuery } from "../../../graphql/queries/knowledge/entity.queries";
import { useEditorContext } from "./editor-context";

export const TitleAndNetSelect = () => {
  const { title, setTitle } = useEditorContext();

  const { data: existingNetsData } = useQuery<
    GetEntitySubgraphQuery,
    GetEntitySubgraphQueryVariables
  >(getEntitySubgraphQuery, {
    variables: {
      request: {
        filter: {
          equal: [
            {
              path: ["entityTypeId"],
              parameter: systemEntityTypes.petriNet.entityTypeId,
            },
          ],
        },
        graphResolveDepths: {
          ...zeroedGraphResolveDepths,
          hasRightEntity: {
            incoming: 1,
            outgoing: 1,
          },
          hasLeftEntity: {
            incoming: 1,
            outgoing: 1,
          },
        },
        includeDrafts: false,
        temporalAxes: currentTimeInstantTemporalAxes,
      },
      includePermissions: false,
    },
  });

  return (
    <Stack
      sx={({ palette }) => ({
        background: palette.gray[5],
        borderBottom: `1px solid ${palette.gray[20]}`,
        py: 1,
        px: 2,
      })}
    >
      <EditableField
        editIconFontSize={14}
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        placeholder="Process"
      />
    </Stack>
  );
};
