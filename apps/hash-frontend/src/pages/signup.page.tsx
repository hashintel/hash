import { useLazyQuery, useMutation, useQuery } from "@apollo/client";
import { Grid, styled, Typography } from "@mui/material";
import { useRouter } from "next/router";
import { useCallback, useEffect, useRef, useState } from "react";

import { AlertModal, ArrowUpRightRegularIcon } from "@hashintel/design-system";

import { useUpdateAuthenticatedUser } from "../components/hooks/use-update-authenticated-user";
import {
  acceptOrgInvitationMutation,
  getMyPendingInvitationsQuery,
  getPendingInvitationByEntityIdQuery,
} from "../graphql/queries/knowledge/org.queries";
import { hasAccessToHashQuery } from "../graphql/queries/user.queries";
import { useInvites } from "../shared/invites-context";
import { getPlainLayout } from "../shared/layout";
import { Button } from "../shared/ui";
import { useAuthInfo } from "./shared/auth-info-context";
import { AuthLayout } from "./shared/auth-layout";
import { parseGraphQLError } from "./shared/auth-utils";
import { VerifyEmailStep } from "./shared/verify-email-step";
import { useActiveWorkspace } from "./shared/workspace-context";
import { AcceptOrgInvitation } from "./signup.page/accept-org-invitation";
import { AccountSetupForm } from "./signup.page/account-setup-form";
import { SignupRegistrationForm } from "./signup.page/signup-registration-form";
import { SignupRegistrationRightInfo } from "./signup.page/signup-registration-right-info";
import { SignupSteps } from "./signup.page/signup-steps";

import type {
  AcceptOrgInvitationMutation,
  AcceptOrgInvitationMutationVariables,
  GetMyPendingInvitationsQuery,
  GetMyPendingInvitationsQueryVariables,
  GetPendingInvitationByEntityIdQuery,
  GetPendingInvitationByEntityIdQueryVariables,
  HasAccessToHashQuery,
} from "../graphql/api-types.gen";
import type { NextPageWithLayout } from "../shared/layout";
import type { ButtonProps } from "../shared/ui";
import type { AccountSetupFormData } from "./signup.page/account-setup-form";
import type { EntityId } from "@blockprotocol/type-system";

type InvitationAcceptanceResult =
  AcceptOrgInvitationMutation["acceptOrgInvitation"];

const getInvitationAcceptanceFailureMessage = ({
  result,
  orgName,
}: {
  result: InvitationAcceptanceResult;
  orgName?: string;
}) => {
  const orgDescription = orgName ? ` to join ${orgName}` : "";
  const orgAdminDescription = orgName ? ` of ${orgName}` : "";

  if (result.expired) {
    return `The invitation${orgDescription} has expired. Please ask an admin${orgAdminDescription} to issue a new one.`;
  }

  if (result.notForUser) {
    return `This invitation${orgDescription} is not for your account. Please ask an admin${orgAdminDescription} to issue a new invitation for the email address or username on your account.`;
  }

  return `The invitation${orgDescription} could not be accepted. Please ask an admin${orgAdminDescription} to issue a new one.`;
};

const LoginButton = styled((props: ButtonProps) => (
  <Button variant="secondary" size="small" {...props} />
))(({ theme }) => ({
  color: theme.palette.gray[90],
  background: theme.palette.blue[10],
  transition: theme.transitions.create(["background", "box-shadow"]),
  borderColor: theme.palette.common.white,
  boxShadow: theme.shadows[3],
  "&:hover": {
    background: theme.palette.common.white,
    boxShadow: theme.shadows[4],
    "&:before": {
      opacity: 0,
    },
  },
}));

const containerWidth = "1200px";

const containerLeftMargin = `((100vw - ${containerWidth}) / 2)`;

const containerPaddingX = "24px";

const containerLeftContentWidth = `((${containerWidth} - ${containerPaddingX}) * (7 / 12))`;

const distanceFromLeft = `calc(
  ${containerLeftMargin}
  + ${containerPaddingX}
  + ${containerLeftContentWidth}
)`;

const SignupPage: NextPageWithLayout = () => {
  const router = useRouter();

  const { authenticatedUser, refetch: refetchAuthenticatedUser } =
    useAuthInfo();
  const { refetch: refetchInvites } = useInvites();
  const { updateActiveWorkspaceWebId } = useActiveWorkspace();

  const userHasVerifiedEmail =
    authenticatedUser?.emails.find(({ verified }) => verified) !== undefined;

  const [fetchHasAccess, { data: userHasAccessToHashData }] =
    useLazyQuery<HasAccessToHashQuery>(hasAccessToHashQuery, {
      fetchPolicy: "network-only",
    });

  /**
   * Eagerly fetch access when the user already has a verified email on mount
   * (e.g. page refresh after verification). The lazy query in `onVerified`
   * handles the in-session verification flow.
   */
  useEffect(() => {
    if (userHasVerifiedEmail && !userHasAccessToHashData) {
      void fetchHasAccess();
    }
  }, [userHasVerifiedEmail, userHasAccessToHashData, fetchHasAccess]);

  const invitationId =
    typeof router.query.invitationId === "string"
      ? router.query.invitationId
      : undefined;

  const [showInvitationStep, setShowInvitationStep] = useState(true);

  const { data: invitationData, loading: invitationLoading } = useQuery<
    GetPendingInvitationByEntityIdQuery,
    GetPendingInvitationByEntityIdQueryVariables
  >(getPendingInvitationByEntityIdQuery, {
    onCompleted: (data) => {
      if (data.getPendingInvitationByEntityId && !authenticatedUser) {
        setShowInvitationStep(true);
      } else {
        setShowInvitationStep(false);
      }
    },
    variables: {
      entityId: invitationId as EntityId,
    },
    skip: !invitationId,
  });

  const { data: pendingInvitationsData, loading: pendingInvitationsLoading } =
    useQuery<
      GetMyPendingInvitationsQuery,
      GetMyPendingInvitationsQueryVariables
    >(getMyPendingInvitationsQuery, {
      skip: !!invitationId || !authenticatedUser || !userHasVerifiedEmail,
    });

  const [acceptInvitation] = useMutation<
    AcceptOrgInvitationMutation,
    AcceptOrgInvitationMutationVariables
  >(acceptOrgInvitationMutation);

  const invitation =
    invitationData?.getPendingInvitationByEntityId ??
    pendingInvitationsData?.getMyPendingInvitations[0];

  const loadingInvitation = invitationLoading || pendingInvitationsLoading;

  const [acceptingInvitation, setAcceptingInvitation] = useState(false);
  const acceptingInvitationEntityIdRef = useRef<EntityId | undefined>(
    undefined,
  );

  const [updateAuthenticatedUser, { loading: updateUserLoading }] =
    useUpdateAuthenticatedUser();

  const [errorMessage, setErrorMessage] = useState<string>();
  const [
    invitationAcceptanceFailureMessage,
    setInvitationAcceptanceFailureMessage,
  ] = useState<string>();

  const clearInvitationAcceptanceReservation = useCallback(() => {
    acceptingInvitationEntityIdRef.current = undefined;
    setAcceptingInvitation(false);
  }, []);

  const acceptInvitationOnce = useCallback(
    async ({
      invitationEntityId,
      alreadyReserved = false,
    }: {
      invitationEntityId: EntityId;
      alreadyReserved?: boolean;
    }): Promise<InvitationAcceptanceResult | undefined> => {
      if (
        !alreadyReserved &&
        acceptingInvitationEntityIdRef.current === invitationEntityId
      ) {
        return undefined;
      }

      acceptingInvitationEntityIdRef.current = invitationEntityId;
      setAcceptingInvitation(true);

      try {
        const { data } = await acceptInvitation({
          variables: {
            orgInvitationEntityId: invitationEntityId,
          },
        });

        const result = data?.acceptOrgInvitation;

        if (!result) {
          throw new Error("Invitation acceptance returned no result.");
        }

        return result;
      } catch (error) {
        clearInvitationAcceptanceReservation();
        throw error;
      }
    },
    [acceptInvitation, clearInvitationAcceptanceReservation],
  );

  useEffect(() => {
    if (
      !router.isReady ||
      !authenticatedUser?.accountSignupComplete ||
      !invitation ||
      acceptingInvitationEntityIdRef.current === invitation.invitationEntityId
    ) {
      return;
    }

    void acceptInvitationOnce({
      invitationEntityId: invitation.invitationEntityId,
    })
      .then(async (result) => {
        if (result?.accepted || result?.alreadyAMember) {
          refetchInvites();
          await refetchAuthenticatedUser();
          updateActiveWorkspaceWebId(invitation.org.webId);
          void router.replace("/");
          return;
        }

        if (result) {
          clearInvitationAcceptanceReservation();
          setInvitationAcceptanceFailureMessage(
            getInvitationAcceptanceFailureMessage({
              result,
              orgName: invitation.org.displayName,
            }),
          );
        }
      })
      .catch(() => {
        clearInvitationAcceptanceReservation();
        setErrorMessage("Could not accept the invitation. Please try again.");
      });
  }, [
    acceptInvitationOnce,
    authenticatedUser?.accountSignupComplete,
    clearInvitationAcceptanceReservation,
    invitation,
    refetchAuthenticatedUser,
    refetchInvites,
    router,
    updateActiveWorkspaceWebId,
  ]);

  useEffect(() => {
    if (
      router.isReady &&
      authenticatedUser?.accountSignupComplete &&
      invitationId &&
      !loadingInvitation &&
      !invitation &&
      !acceptingInvitation
    ) {
      void router.replace("/");
    }
  }, [
    acceptingInvitation,
    authenticatedUser?.accountSignupComplete,
    invitation,
    invitationId,
    loadingInvitation,
    router,
  ]);

  const handleAccountSetupSubmit = useCallback(
    async (params: AccountSetupFormData) => {
      const { shortname, displayName } = params;

      const reservedInvitationEntityId = invitation?.invitationEntityId;
      if (reservedInvitationEntityId) {
        acceptingInvitationEntityIdRef.current = reservedInvitationEntityId;
        setAcceptingInvitation(true);
      }

      const updateAccountResult = await updateAuthenticatedUser({
        shortname,
        displayName,
      }).catch(() => {
        if (reservedInvitationEntityId) {
          clearInvitationAcceptanceReservation();
        }

        setErrorMessage("Could not update your account. Please try again.");
        return undefined;
      });

      if (!updateAccountResult) {
        return;
      }

      const { errors } = updateAccountResult;

      if (errors && errors.length > 0) {
        const { message } = parseGraphQLError([...errors]);
        setErrorMessage(message);
        if (reservedInvitationEntityId) {
          clearInvitationAcceptanceReservation();
        }
        return;
      }

      if (reservedInvitationEntityId) {
        const invitationAcceptanceResult = await acceptInvitationOnce({
          invitationEntityId: reservedInvitationEntityId,
          alreadyReserved: true,
        })
          .then((result) => result)
          .catch(() => {
            clearInvitationAcceptanceReservation();
            setErrorMessage(
              "Could not accept the invitation. Please try again.",
            );

            return undefined;
          });

        if (!invitationAcceptanceResult) {
          return;
        }

        if (
          !invitationAcceptanceResult.accepted &&
          !invitationAcceptanceResult.alreadyAMember
        ) {
          clearInvitationAcceptanceReservation();
          setInvitationAcceptanceFailureMessage(
            getInvitationAcceptanceFailureMessage({
              result: invitationAcceptanceResult,
              orgName: invitation.org.displayName,
            }),
          );
          return;
        }
      }

      await refetchAuthenticatedUser();
      refetchInvites();
      if (invitation) {
        updateActiveWorkspaceWebId(invitation.org.webId);
      }

      void router.push("/");
    },
    [
      acceptInvitationOnce,
      clearInvitationAcceptanceReservation,
      invitation,
      refetchInvites,
      refetchAuthenticatedUser,
      updateAuthenticatedUser,
      updateActiveWorkspaceWebId,
      router,
    ],
  );

  const verificationFlowId =
    typeof router.query.verificationFlowId === "string"
      ? router.query.verificationFlowId
      : undefined;

  return (
    <>
      {invitationAcceptanceFailureMessage ? (
        <AlertModal
          calloutMessage="Invitation could not be accepted"
          close={() => {
            setInvitationAcceptanceFailureMessage(undefined);
            void router.replace("/");
          }}
          header="Invitation unavailable"
          type="warning"
        >
          <Typography>{invitationAcceptanceFailureMessage}</Typography>
        </AlertModal>
      ) : null}
      <AuthLayout
        sx={{
          background: ({ palette }) => ({
            xs: undefined,
            md: `linear-gradient(
            to right,
            ${palette.gray[10]} 0%,
            ${palette.gray[10]} ${distanceFromLeft},
            ${palette.gray[20]} ${distanceFromLeft},
            ${palette.gray[20]} 100%)`,
          }),
        }}
        headerEndAdornment={
          authenticatedUser ? null : (
            <LoginButton href="/signin" endIcon={<ArrowUpRightRegularIcon />}>
              Sign In
            </LoginButton>
          )
        }
      >
        <Grid container columnSpacing={16}>
          <Grid item xs={12} md={7}>
            {loadingInvitation ? null : invitation &&
              showInvitationStep &&
              !authenticatedUser ? (
              <AcceptOrgInvitation
                invitation={invitation}
                onAccept={() => setShowInvitationStep(false)}
              />
            ) : authenticatedUser ? (
              userHasVerifiedEmail ? (
                userHasAccessToHashData?.hasAccessToHash ? (
                  <AccountSetupForm
                    onSubmit={handleAccountSetupSubmit}
                    loading={updateUserLoading || acceptingInvitation}
                    errorMessage={errorMessage}
                  />
                ) : null
              ) : (
                <VerifyEmailStep
                  email={authenticatedUser.emails[0]?.address ?? ""}
                  initialVerificationFlowId={verificationFlowId}
                  onVerified={async () => {
                    await refetchAuthenticatedUser();

                    const { data } = await fetchHasAccess();

                    if (!data?.hasAccessToHash) {
                      void router.replace("/");
                    }
                  }}
                />
              )
            ) : (
              <SignupRegistrationForm />
            )}
          </Grid>
          <Grid
            item
            xs={12}
            md={5}
            sx={{
              display: "flex",
              alignItems: "center",
              paddingY: {
                xs: 6,
                md: 0,
              },
            }}
          >
            {authenticatedUser || invitation ? (
              <SignupSteps
                currentStep={
                  invitation && !authenticatedUser
                    ? "accept-invitation"
                    : !userHasVerifiedEmail
                      ? "verify-email"
                      : "reserve-username"
                }
                withInvitation={!!invitation}
              />
            ) : (
              <SignupRegistrationRightInfo />
            )}
          </Grid>
        </Grid>
      </AuthLayout>
    </>
  );
};

SignupPage.getLayout = getPlainLayout;

export default SignupPage;
