import { useMutation, useQuery } from "@apollo/client";
import { ArrowUpRightRegularIcon, ChromeIcon } from "@hashintel/design-system";
import { isSelfHostedInstance } from "@local/hash-isomorphic-utils/instance";
import { systemEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import type { ProspectiveUserProperties } from "@local/hash-isomorphic-utils/system-types/prospectiveuser";
import { Box } from "@mui/material";
import { useCallback, useState } from "react";

import type {
  CreateEntityMutation,
  CreateEntityMutationVariables,
  GetWaitlistPositionQuery,
} from "../../graphql/api-types.gen";
import { createEntityMutation } from "../../graphql/queries/knowledge/entity.queries";
import { getWaitlistPositionQuery } from "../../graphql/queries/user.queries";
import { ArrowRightIcon } from "../../shared/icons/arrow-right";
import { Button } from "../../shared/ui/button";
import { DiscordCard } from "./shared/discord-card";
import { FollowUsButton } from "./shared/follow-us-button";
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
      href="https://hash.ai/signup"
      variant="primary"
      size="small"
      sx={{ borderRadius: 2 }}
    >
      Create an account
      <ArrowRightIcon sx={{ fontSize: 14, ml: 1 }} />
    </Button>
  </HomepageCard>
);

export const Waitlisted = () => {
  const { data } = useQuery<GetWaitlistPositionQuery>(
    getWaitlistPositionQuery,
    { skip: isSelfHostedInstance },
  );

  const [earlyAccessFormState, setEarlyAccessFormState] = useState<
    "closed" | "open" | "submitted"
  >("closed");

  const position = data?.getWaitlistPosition;

  const [createFn] = useMutation<
    CreateEntityMutation,
    CreateEntityMutationVariables
  >(createEntityMutation);

  const submitForm = useCallback(
    async (properties: ProspectiveUserProperties) => {
      await createFn({
        variables: {
          entityTypeId: systemEntityTypes.prospectiveUser.entityTypeId,
          properties,
        },
      });

      setEarlyAccessFormState("submitted");
    },
    [createFn],
  );

  return (
    <>
      {!isSelfHostedInstance && earlyAccessFormState !== "submitted" && (
        <EarlyAccessFormModal
          onClose={() => setEarlyAccessFormState("closed")}
          open={earlyAccessFormState === "open"}
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
                  component="span"
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
                  component="span"
                  sx={{ color: ({ palette }) => palette.teal[60], ml: 0.8 }}
                >
                  for access
                </Box>
              </HomepageSmallCaps>
              <FollowUsButton />
            </HomepageCard>
            <HomepageCard>
              {earlyAccessFormState === "submitted" ? (
                <>
                  <HomepageBigText
                    sx={{ color: ({ palette }) => palette.blue[70] }}
                  >
                    Thank you
                  </HomepageBigText>
                  <HomepageBigText>we'll be in touch</HomepageBigText>
                </>
              ) : (
                <>
                  <HomepageBigText>Skip the wait </HomepageBigText>
                  <HomepageBigText
                    sx={{ color: ({ palette }) => palette.blue[70] }}
                  >
                    get early access
                  </HomepageBigText>
                  <HomepageSmallCaps>Jump the queue</HomepageSmallCaps>
                  <Button
                    onClick={() => setEarlyAccessFormState("open")}
                    variant="primary"
                    size="small"
                    sx={{ borderRadius: 2 }}
                  >
                    <Box
                      component="span"
                      sx={{ color: ({ palette }) => palette.blue[25], mr: 0.5 }}
                    >
                      Tell us about your
                    </Box>
                    use case
                    <ArrowRightIcon sx={{ fontSize: 14, ml: 1 }} />
                  </Button>
                </>
              )}
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
            href="https://chromewebstore.google.com/detail/hash-ai/nljhmbdifehhnkhinhfooebllaajlddb"
            variant="white_cta"
            size="small"
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
        <DiscordCard />
      </HomepageGrid>
    </>
  );
};
