import { ArrowUpRightRegularIcon } from "@hashintel/design-system";
import { Grid, styled } from "@mui/material";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";

import { useUpdateAuthenticatedUser } from "../components/hooks/use-update-authenticated-user";
import { getPlainLayout, NextPageWithLayout } from "../shared/layout";
import { Button, ButtonProps } from "../shared/ui";
import { useAuthInfo } from "./shared/auth-info-context";
import { AuthLayout } from "./shared/auth-layout";
import { parseGraphQLError } from "./shared/auth-utils";
import { AccountSetupForm } from "./signup.page/account-setup-form";
import { SignupRegistrationForm } from "./signup.page/signup-registration-form";
import { SignupRegistrationRightInfo } from "./signup.page/signup-registration-right-info";

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

  const { authenticatedUser } = useAuthInfo();

  const [updateAuthenticatedUser, { loading: updateUserLoading }] =
    useUpdateAuthenticatedUser();

  useEffect(() => {
    if (authenticatedUser && authenticatedUser.accountSignupComplete) {
      void router.push("/");
    }
  }, [authenticatedUser, router]);

  const [invitationInfo] = useState<null>(null);
  const [errorMessage, setErrorMessage] = useState<string>();

  const handleAccountSetupSubmit = async (params: {
    shortname: string;
    preferredName: string;
  }) => {
    const { shortname, preferredName } = params;

    const { errors } = await updateAuthenticatedUser({
      shortname,
      preferredName,
    });

    if (errors && errors.length > 0) {
      const { message } = parseGraphQLError([...errors]);
      setErrorMessage(message);
    }

    // Redirecting to the homepage is covered by the useEffect to redirect all authenticated users away from /signup
  };

  /** @todo: un-comment this to actually check whether the email is verified */
  // const userHasVerifiedEmail =
  //   authenticatedUser?.emails.find(({ verified }) => verified) !== undefined;
  const userHasVerifiedEmail = true;

  return (
    <AuthLayout
      sx={{
        background: ({ palette }) =>
          `linear-gradient(
            to right,
            ${palette.gray[10]} 0%, 
            ${palette.gray[10]} ${distanceFromLeft},
            ${palette.gray[20]} ${distanceFromLeft},
            ${palette.gray[20]} 100%)`,
      }}
      headerEndAdornment={
        authenticatedUser ? null : (
          <LoginButton href="/login" endIcon={<ArrowUpRightRegularIcon />}>
            Sign In
          </LoginButton>
        )
      }
    >
      <Grid container spacing={16}>
        <Grid item md={7}>
          {authenticatedUser ? (
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- @todo improve logic or types to remove this comment
            userHasVerifiedEmail ? (
              <AccountSetupForm
                onSubmit={handleAccountSetupSubmit}
                loading={updateUserLoading}
                errorMessage={errorMessage}
                email={authenticatedUser.emails[0]!.address}
                invitationInfo={invitationInfo}
              />
            ) : /** @todo: add verification form */
            null
          ) : (
            <SignupRegistrationForm />
          )}
        </Grid>
        <Grid item md={5} sx={{ display: "flex", alignItems: "center" }}>
          {authenticatedUser ? null : <SignupRegistrationRightInfo />}
        </Grid>
      </Grid>
    </AuthLayout>
  );
};

SignupPage.getLayout = getPlainLayout;

export default SignupPage;
