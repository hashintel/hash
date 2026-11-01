import { Box, Stack, Typography } from "@mui/material";
import { useState } from "react";

import {
  extractWebIdFromEntityId,
  isEntityId,
} from "@blockprotocol/type-system";
import {
  ArrowUpRightRegularIcon,
  CodeIcon,
  InfinityLightIcon,
  Skeleton,
  WandMagicSparklesIcon,
} from "@hashintel/design-system";
import { generateWorkerRunPath } from "@local/hash-isomorphic-utils/flows/frontend-paths";

import { useUserOrOrgShortnameByWebId } from "../../../../../../components/hooks/use-user-or-org-shortname-by-owned-by-id";
import { SearchIcon } from "../../../../../../shared/icons/search-icon";
import { UserIcon } from "../../../../../../shared/icons/user-icon";
import { Link } from "../../../../../../shared/ui/link";
import { useActors } from "../../../../../../shared/use-actors";
import { SourcesSlideover } from "./provenance/sources-slideover";

import type { HistoryEvent } from "../shared/types";
import type { Subgraph } from "@blockprotocol/graph";
import type { OriginProvenance } from "@blockprotocol/type-system";
import type { SvgIconProps, SxProps, Theme } from "@mui/material";
import type { FunctionComponent, PropsWithChildren } from "react";

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
  OriginProvenance["type"],
  FunctionComponent<SvgIconProps>
> = {
  flow: InfinityLightIcon,
  "browser-extension": UserIcon,
  "web-app": UserIcon,
  "mobile-app": UserIcon,
  api: CodeIcon,
  external: CodeIcon,
  migration: CodeIcon,
};

const typographySx: SxProps<Theme> = {
  fontSize: 14,
  lineHeight: 1,
};

const ProvenanceRow = ({ children }: PropsWithChildren) => (
  <Stack direction="row" alignItems="center" gap={1.5} my={0.5}>
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

  /* A flow's origin id is the entity id of the run that made the edition. Other origins give ids of their own. */
  const flowRunEntityId =
    edition.origin.type === "flow" &&
    edition.origin.id !== undefined &&
    isEntityId(edition.origin.id)
      ? edition.origin.id
      : undefined;

  /* The run page is under the shortname of the run's web, which may not be the entity's. */
  const { shortname: flowRunShortname } = useUserOrOrgShortnameByWebId({
    webId: flowRunEntityId ? extractWebIdFromEntityId(flowRunEntityId) : null,
  });

  const { actors, loading } = useActors({
    accountIds: [edition.createdById],
  });

  const [showSourcesSlideover, setShowSourcesSlideover] = useState(false);

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

  const originType = edition.origin.type;
  const actorType = edition.actorType;

  const originTextPrefix = event.type === "created" ? "Created" : "Updated";

  let originText = `${originTextPrefix} from the`;
  if (originType === "flow" || originType === "migration") {
    originText = `${originTextPrefix} by a`;
  }

  const originLabel =
    originType === "external" ? "public API" : originType.split("-").join(" ");

  const OriginIcon = provenanceIconMap[originType];

  const sources =
    event.type === "property-update"
      ? event.provenance.property?.sources
      : event.provenance.edition.sources;

  return (
    <>
      {!!sources?.length && (
        <SourcesSlideover
          event={event}
          onClose={() => setShowSourcesSlideover(false)}
          open={showSourcesSlideover}
          subgraph={subgraph}
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
        <Stack direction="row" gap={4}>
          <Stack gap={0.8}>
            <ProvenanceHeader label="Change origins" />
            <ProvenanceRow>
              <OriginIcon sx={provenanceIconSx} />
              <Typography sx={typographySx}>
                {originText}
                <Box component="span" sx={{ fontWeight: 600, ml: 0.5 }}>
                  {originLabel}
                </Box>
              </Typography>
              {flowRunEntityId && flowRunShortname && (
                <Link
                  href={generateWorkerRunPath({
                    flowRunEntityId,
                    shortname: flowRunShortname,
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
                  target="_blank"
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
            <ProvenanceRow>
              {actorType === "ai" ? (
                <WandMagicSparklesIcon sx={provenanceIconSx} />
              ) : (
                <OriginIcon sx={provenanceIconSx} />
              )}
              <Typography sx={typographySx}>
                {originTextPrefix} by
                <Box component="span" sx={{ fontWeight: 600, ml: 0.5 }}>
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
          {!!sources?.length && (
            <Stack gap={0.5}>
              <ProvenanceHeader label="Information origins" />
              <ProvenanceRow>
                <SearchIcon sx={provenanceIconSx} />
                <Typography sx={typographySx}>
                  Inferred from
                  <Box
                    component="button"
                    onClick={() => setShowSourcesSlideover(true)}
                    sx={{
                      background: "none",
                      padding: 0,
                      border: "none",
                      fontWeight: 600,
                      color: ({ palette }) => palette.blue[70],
                      cursor: "pointer",
                      ml: 0.6,
                    }}
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
