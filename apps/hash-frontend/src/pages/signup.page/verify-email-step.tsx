import { TextField } from "@hashintel/design-system";
import { Box, Typography } from "@mui/material";
import type { VerificationFlow } from "@ory/client";
import { isUiNodeInputAttributes } from "@ory/integrations/ui";
import type { AxiosError } from "axios";
import type { FormEventHandler, FunctionComponent } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "../../shared/ui";
import { AuthHeading } from "../shared/auth-heading";
import { AuthPaper } from "../shared/auth-paper";
import {
  mustGetCsrfTokenFromFlow,
  oryKratosClient,
} from "../shared/ory-kratos";
import { useKratosErrorHandler } from "../shared/use-kratos-flow-error-handler";

type VerifyEmailStepProps = {
  email: string;
  onVerified: () => void | Promise<void>;
};

export const VerifyEmailStep: FunctionComponent<VerifyEmailStepProps> = ({
  email,
  onVerified,
}) => {
  const [flow, setFlow] = useState<VerificationFlow>();
  const [code, setCode] = useState("");
  const [errorMessage, setErrorMessage] = useState<string>();
  const [sendingCode, setSendingCode] = useState(false);
  const [verifyingCode, setVerifyingCode] = useState(false);

  const { handleFlowError } = useKratosErrorHandler({
    flowType: "verification",
    setFlow,
    setErrorMessage,
  });

  const extractCodeValue = useCallback((nextFlow: VerificationFlow) => {
    const codeInputNode = nextFlow.ui.nodes.find(
      ({ attributes }) =>
        isUiNodeInputAttributes(attributes) && attributes.name === "code",
    );

    if (
      codeInputNode &&
      isUiNodeInputAttributes(codeInputNode.attributes) &&
      "value" in codeInputNode.attributes &&
      typeof codeInputNode.attributes.value === "string"
    ) {
      setCode(codeInputNode.attributes.value);
    }
  }, []);

  const createAndSendVerificationCode = useCallback(() => {
    if (!email) {
      setErrorMessage("Could not determine the email address to verify.");
      return;
    }

    setErrorMessage(undefined);
    setCode("");
    setSendingCode(true);

    void oryKratosClient
      .createBrowserVerificationFlow()
      .then(async ({ data: verificationFlow }) =>
        oryKratosClient.updateVerificationFlow({
          flow: verificationFlow.id,
          updateVerificationFlowBody: {
            method: "code",
            email,
            csrf_token: mustGetCsrfTokenFromFlow(verificationFlow),
          },
        }),
      )
      .then(({ data }) => {
        setFlow(data);
        extractCodeValue(data);
      })
      .catch(handleFlowError)
      .catch((error: AxiosError<VerificationFlow>) => {
        if (error.response?.status === 400) {
          setFlow(error.response.data);
          return;
        }

        return Promise.reject(error);
      })
      .finally(() => setSendingCode(false));
  }, [email, extractCodeValue, handleFlowError]);

  useEffect(() => {
    createAndSendVerificationCode();
  }, [createAndSendVerificationCode]);

  const codeInputUiNode = useMemo(
    () =>
      flow?.ui.nodes.find(
        ({ attributes }) =>
          isUiNodeInputAttributes(attributes) && attributes.name === "code",
      ),
    [flow],
  );

  const handleSubmit: FormEventHandler<HTMLFormElement> = (event) => {
    event.preventDefault();

    if (!flow || !code) {
      return;
    }

    setVerifyingCode(true);

    void oryKratosClient
      .updateVerificationFlow({
        flow: flow.id,
        updateVerificationFlowBody: {
          method: "code",
          code,
          csrf_token: mustGetCsrfTokenFromFlow(flow),
        },
      })
      .then(async () => {
        await onVerified();
      })
      .catch(handleFlowError)
      .catch((error: AxiosError<VerificationFlow>) => {
        if (error.response?.status === 400) {
          setFlow(error.response.data);
          return;
        }

        return Promise.reject(error);
      })
      .finally(() => setVerifyingCode(false));
  };

  return (
    <AuthPaper>
      <AuthHeading>Verify your email address</AuthHeading>
      <Typography
        sx={{
          fontSize: 16,
          color: ({ palette }) => palette.gray[70],
          mb: 3,
        }}
      >
        We've sent a verification code to {email}
      </Typography>
      <Box
        component="form"
        onSubmit={handleSubmit}
        sx={{
          display: "flex",
          flexDirection: "column",
          rowGap: 1.5,
          width: "100%",
        }}
      >
        <TextField
          label="Verification code"
          type="text"
          autoComplete="one-time-code"
          placeholder="Enter your verification code"
          value={code}
          onChange={({ target }) => setCode(target.value)}
          error={
            !!codeInputUiNode?.messages.find(({ type }) => type === "error")
          }
          helperText={codeInputUiNode?.messages.map(({ id, text }) => (
            <Typography key={id}>{text}</Typography>
          ))}
          required
          inputProps={{
            maxLength: 6,
            inputMode: "numeric",
            pattern: "[0-9]{6}",
          }}
        />
        <Button type="submit" disabled={!code || verifyingCode || sendingCode}>
          {verifyingCode ? "Verifying..." : "Verify"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={createAndSendVerificationCode}
          disabled={sendingCode || verifyingCode}
        >
          {sendingCode ? "Resending..." : "Resend verification email"}
        </Button>
        {flow?.ui.messages?.map(({ id, text }) => (
          <Typography key={id}>{text}</Typography>
        ))}
        {errorMessage ? <Typography>{errorMessage}</Typography> : null}
      </Box>
    </AuthPaper>
  );
};
