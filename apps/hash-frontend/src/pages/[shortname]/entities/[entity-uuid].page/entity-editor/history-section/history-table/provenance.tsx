import { useRouter } from "next/router";
import type { FunctionComponent, PropsWithChildren , useState } from "react";
import {
  ArrowUpRightRegularIcon,
  CodeIcon,
  InfinityLightIcon,
  Skeleton,
  WandMagicSparklesIcon,
} from "@hashintel/design-system";
import type { ProvidedEntityEditionProvenanceOriginTypeEnum } from "@local/hash-graph-client";
import type { AccountId } from "@local/hash-graph-types/account";
import type { EntityId } from "@local/hash-graph-types/entity";
import { generateWorkerRunPath } from "@local/hash-isomorphic-utils/flows/frontend-paths";
import type { extractEntityUuidFromEntityId,Subgraph  } from "@local/hash-subgraph";
import type { Box, Stack, SvgIconProps, SxProps, Theme , Typography } from "@mui/material";

import { SearchIcon } from "../../../../../../../shared/icons/search-icon";
import { UserIcon } from "../../../../../../../shared/icons/user-icon";
import { Link } from "../../../../../../../shared/ui/link";
import { useActors } from "../../../../../../../shared/use-actors";
import type { HistoryEvent } from "../shared/types";

import { SourcesSlideover } from "./provenance/sources-slideover";

const ProvenanceHeader = ({ label }: { label: string }) => (
  <Typography sx={{ color: "black", fontWeight: 700, fontSize: 14 }}>
    {label}
  </Typography>
);

const provenanceIconSx: SxProps<Theme> = {
  fill: ({ palette }) => palette.gray[50],
  fontSize: 14,
};

const provenanceIconMap: Record<
  | ProvidedEntityEditionProvenanceOriginTypeEnum
  /**
   * @todo: remove this when remaining possible values have been correctly included in `ProvidedEntityEditionProvenanceOrigin`
   */
  | "flow"
  | "browser-extension"
  | "web-app"
  | "mobile-app"
  | "api",
  FunctionComponent<SvgIconProps>
> = {
  flow: InfinityLightIcon,
  "browser-extension": UserIcon,
  "web-app": UserIcon,
  "mobile-app": UserIcon,
  api: CodeIcon,
  migration: CodeIcon,
};

const typographySx: SxProps<Theme> = {
  fontSize: 14,
  lineHeight: 1,
};

const ProvenanceRow = ({ children }: PropsWithChildren) => (
  <Stack direction={"row"} alignItems={"center"} gap={1.5} my={0.5}>
    {children}
  </Stack>
);

export const Provenance = ({
  event,
  subgraph,
}: {
  event: HistoryEvent;
  subgraph: Subgraph;
}) => {
  const {
    provenance: { edition },
  } = event;

  const { actors, loading } = useActors({
    accountIds: [edition.createdById as AccountId],
  });

  const [showSourcesSlideover, setShowSourcesSlideover] = useState(false);

  const { query } = useRouter();
  const shortname = query.shortname as string;

  if (loading) {
    return (
      <Box py={2} px={4}>
        <Skeleton height={200} />
      </Box>
    );
  }

  const actor = actors?.[0];

  if (!actor) {
    throw new Error(
      `Could not fetch creator actor with id ${edition.createdById}`,
    );
  }

  const originType = edition.origin?.type;
  const {actorType} = edition;

  const originTextPrefix = event.type === "created" ? "Created" : "Updated";

  let originText = originType
    ? `${originTextPrefix} from the`
    : `${originTextPrefix} from`;

  // @ts-expect-error - `ProvidedEntityEditionProvenanceOrigin` is not being generated correctly from the Graph API
  if (originType === "flow" || originType === "migration") {
    originText = `${originTextPrefix} by a`;
  }

  const OriginIcon = originType && provenanceIconMap[originType];

  const flowRunEntityId = edition.origin?.id as EntityId | undefined;

  const sources =
    event.type === "property-update"
      ? event.provenance.property?.sources
      : event.provenance.edition.sources;

  return (
    <>
      {Boolean(sources?.length) && (
        <SourcesSlideover
          event={event}
          open={showSourcesSlideover}
          subgraph={subgraph}
          onClose={() => { setShowSourcesSlideover(false); }}
        />
      )}
      <Box
        py={2}
        px={4}
        sx={({ palette }) => ({
          background: palette.blue[10],
          borderTop: `1px solid ${palette.blue[20]}`,
          borderRadius: 2,
        })}
      >
        <Stack direction={"row"} gap={4}>
          <Stack gap={0.8}>
            <ProvenanceHeader label={"Change origins"} />
            {originType && (
              <ProvenanceRow>
                {OriginIcon ? <OriginIcon sx={provenanceIconSx} /> : null}
                <Typography sx={typographySx}>
                  {originText}
                  <Box component={"span"} sx={{ fontWeight: 600, ml: 0.5 }}>
                    {originType.split("-").join(" ")}
                  </Box>
                </Typography>
                {flowRunEntityId && (
                  <Link
                    target={"_blank"}
                    href={generateWorkerRunPath({
                      flowRunId: extractEntityUuidFromEntityId(flowRunEntityId),
                      shortname,
                    })}
                    sx={{
                      ...typographySx,
                      display: "flex",
                      alignItems: "center",
                      fontWeight: 600,
                      textDecoration: "none",
                      pl: 1.5,
                      borderLeft: ({ palette }) =>
                        `1px solid ${palette.gray[40]}`,
                    }}
                  >
                    View run
                    <ArrowUpRightRegularIcon
                      sx={{
                        fill: ({ palette }) => palette.blue[70],
                        ml: 0.5,
                        ...typographySx,
                      }}
                    />
                  </Link>
                )}
              </ProvenanceRow>
            )}
            <ProvenanceRow>
              {actorType === "ai" ? (
                <WandMagicSparklesIcon sx={provenanceIconSx} />
              ) : OriginIcon ? (
                <OriginIcon sx={provenanceIconSx} />
              ) : (
                <UserIcon sx={provenanceIconSx} />
              )}
              <Typography sx={typographySx}>
                {originTextPrefix} by
                <Box component={"span"} sx={{ fontWeight: 600, ml: 0.5 }}>
                  {actor.kind === "machine" ? (
                    actor.displayName
                  ) : (
                    <Link href={`/@${actor.shortname}`}>
                      {actor.displayName}
                    </Link>
                  )}
                </Box>
              </Typography>
            </ProvenanceRow>
          </Stack>
          {Boolean(sources?.length) && (
            <Stack gap={0.5}>
              <ProvenanceHeader label={"Information origins"} />
              <ProvenanceRow>
                <SearchIcon sx={provenanceIconSx} />
                <Typography sx={typographySx}>
                  Inferred from
                  <Box
                    component={"button"}
                    sx={{
                      background: "none",
                      padding: 0,
                      border: "none",
                      fontWeight: 600,
                      color: ({ palette }) => palette.blue[70],
                      cursor: "pointer",
                      ml: 0.6,
                    }}
                    onClick={() => { setShowSourcesSlideover(true); }}
                  >
                    {sources.length}{" "}
                    {sources.length === 1 ? "source" : "sources"}
                  </Box>
                </Typography>
              </ProvenanceRow>
            </Stack>
          )}
        </Stack>
      </Box>
    </>
  );
};
