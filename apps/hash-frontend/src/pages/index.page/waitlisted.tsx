import { useCallback, useState } from "react";
import { useMutation, useQuery } from "@apollo/client";
import {
  ArrowRightIconRegular,
  ArrowUpRightRegularIcon,
  CheckIcon,
  ChromeIcon,
} from "@hashintel/design-system";
import {
  currentTimeInstantTemporalAxes,
  generateVersionedUrlMatchingFilter,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import { isSelfHostedInstance } from "@local/hash-isomorphic-utils/instance";
import { systemEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import type { ProspectiveUserProperties } from "@local/hash-isomorphic-utils/system-types/prospectiveuser";
import { Box } from "@mui/material";

import type {
  GetEntitySubgraphQuery,
  GetEntitySubgraphQueryVariables,
  GetWaitlistPositionQuery,
  SubmitEarlyAccessFormMutation,
  SubmitEarlyAccessFormMutationVariables,
} from "../../graphql/api-types.gen";
import { getEntitySubgraphQuery } from "../../graphql/queries/knowledge/entity.queries";
import {
  getWaitlistPositionQuery,
  submitEarlyAccessFormMutation,
} from "../../graphql/queries/user.queries";
import { Button } from "../../shared/ui/button";

import { FollowUsButton } from "./shared/follow-us-button";
import { GuideCard } from "./shared/guide-card";
import { HomepageCard } from "./shared/homepage-card";
import { HomepageGrid } from "./shared/homepage-grid";
import { HomepageBigText, HomepageSmallCaps } from "./shared/typography";
import { UsesCard } from "./shared/uses-card";
import { EarlyAccessFormModal } from "./waitlisted/early-access-modal";

const SelfHostedAccessDenied = () => (
  <HomepageCard wide>
    <HomepageBigText>You do not have access</HomepageBigText>
    <HomepageBigText>to this instance</HomepageBigText>
    <HomepageSmallCaps>Sign up for hosted HASH instead</HomepageSmallCaps>
    <Button
      href={"https://hash.ai/signup"}
      variant={"primary"}
      size={"small"}
      sx={{ borderRadius: 2 }}
    >
      Create an account
      <ArrowRightIconRegular sx={{ fontSize: 14, ml: 1 }} />
    </Button>
  </HomepageCard>
);

export const Waitlisted = () => {
  const { data: waitlistPositionData } = useQuery<GetWaitlistPositionQuery>(
    getWaitlistPositionQuery,
    { skip: isSelfHostedInstance },
  );

  const [earlyAccessFormState, setEarlyAccessFormState] = useState<
    "closed" | "open" | "submitted"
  >("closed");

  useQuery<GetEntitySubgraphQuery, GetEntitySubgraphQueryVariables>(
    getEntitySubgraphQuery,
    {
      variables: {
        request: {
          filter: generateVersionedUrlMatchingFilter(
            systemEntityTypes.prospectiveUser.entityTypeId,
          ),
          graphResolveDepths: zeroedGraphResolveDepths,
          includeDrafts: false,
          temporalAxes: currentTimeInstantTemporalAxes,
        },
        includePermissions: false,
      },
      fetchPolicy: "cache-and-network",
      onCompleted: (data) => {
        if (data.getEntitySubgraph.subgraph.roots.length > 0) {
          setEarlyAccessFormState("submitted");
        }
      },
    },
  );

  const position = waitlistPositionData?.getWaitlistPosition;

  const [submitToApi] = useMutation<
    SubmitEarlyAccessFormMutation,
    SubmitEarlyAccessFormMutationVariables
  >(submitEarlyAccessFormMutation);

  const submitForm = useCallback(
    async (properties: ProspectiveUserProperties) => {
      await submitToApi({
        variables: {
          properties,
        },
      });

      setEarlyAccessFormState("submitted");
    },
    [submitToApi],
  );

  const hasSubmittedForm = earlyAccessFormState === "submitted";

  return (
    <>
      {!isSelfHostedInstance && !hasSubmittedForm && (
        <EarlyAccessFormModal
          open={earlyAccessFormState === "open"}
          onClose={() => {
            setEarlyAccessFormState("closed");
          }}
          onSubmit={submitForm}
        />
      )}
      <HomepageGrid>
        {isSelfHostedInstance ? (
          <SelfHostedAccessDenied />
        ) : (
          <>
            <HomepageCard>
              <HomepageBigText>
                You are{" "}
                <Box
                  component={"span"}
                  sx={{
                    color: ({ palette }) =>
                      position ? palette.teal[60] : "inherit",
                  }}
                >
                  {position ? `#${position}` : "currently"}
                </Box>
              </HomepageBigText>
              <HomepageBigText>on the waitlist</HomepageBigText>
              <HomepageSmallCaps>
                Stay tuned
                <Box
                  component={"span"}
                  sx={{ color: ({ palette }) => palette.teal[60], ml: 0.8 }}
                >
                  for access
                </Box>
              </HomepageSmallCaps>
              <FollowUsButton />
            </HomepageCard>
            <HomepageCard>
              <HomepageBigText>Skip the wait </HomepageBigText>
              <HomepageBigText
                sx={{ color: ({ palette }) => palette.blue[70] }}
              >
                get early access
              </HomepageBigText>
              <HomepageSmallCaps>Jump the queue</HomepageSmallCaps>
              <Button
                disabled={hasSubmittedForm}
                variant={"primary"}
                size={"small"}
                sx={{ borderRadius: 2 }}
                onClick={() => {
                  setEarlyAccessFormState("open");
                }}
              >
                {hasSubmittedForm ? (
                  <>
                    You have applied{" "}
                    <CheckIcon
                      sx={{
                        fill: ({ palette }) => palette.green[70],
                        fontSize: 16,
                        ml: 1,
                      }}
                    />
                  </>
                ) : (
                  <>
                    <Box
                      component={"span"}
                      sx={{ color: ({ palette }) => palette.blue[25], mr: 0.5 }}
                    >
                      Tell us about your
                    </Box>
                    use case
                    <ArrowRightIconRegular sx={{ fontSize: 14, ml: 1 }} />
                  </>
                )}
              </Button>
            </HomepageCard>
          </>
        )}
        <HomepageCard wide={isSelfHostedInstance}>
          <HomepageBigText sx={{ fontWeight: 400 }}>
            Install the{" "}
          </HomepageBigText>
          <HomepageBigText
            sx={{ color: ({ palette }) => palette.aqua[70], fontWeight: 700 }}
          >
            HASH extension
          </HomepageBigText>
          <HomepageSmallCaps>Get ready</HomepageSmallCaps>
          <Button
            href={
              "https://chromewebstore.google.com/detail/hash-ai/nljhmbdifehhnkhinhfooebllaajlddb"
            }
            variant={"white_cta"}
            size={"small"}
          >
            <ChromeIcon sx={{ fontSize: 18, mr: 1.5 }} />
            Download for Chrome
            <ArrowUpRightRegularIcon
              sx={{
                fontSize: 15,
                ml: 0.8,
                fill: ({ palette }) => palette.aqua[70],
              }}
            />
          </Button>
        </HomepageCard>
        <UsesCard />
        <GuideCard />
      </HomepageGrid>
    </>
  );
};
