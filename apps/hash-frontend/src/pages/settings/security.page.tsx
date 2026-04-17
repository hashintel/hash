import { Modal, TextField } from "@hashintel/design-system";
import { Box, Divider, Grid, Typography } from "@mui/material";
import type { SettingsFlow, UpdateSettingsFlowBody } from "@ory/client";
import {
  isUiNodeImageAttributes,
  isUiNodeInputAttributes,
  isUiNodeTextAttributes,
} from "@ory/integrations/ui";
import type { AxiosError } from "axios";
import { useRouter } from "next/router";
import type { FormEventHandler } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { NextPageWithLayout } from "../../shared/layout";
import { Button } from "../../shared/ui";
import { useAuthInfo } from "../shared/auth-info-context";
import { formatKratosMessage } from "../shared/format-kratos-message";
import {
  mustGetCsrfTokenFromFlow,
  oryKratosClient,
} from "../shared/ory-kratos";
import { getSettingsLayout } from "../shared/settings-layout";
import { useKratosErrorHandler } from "../shared/use-kratos-flow-error-handler";
import { SettingsPageContainer } from "./shared/settings-page-container";

const getUiTextValue = (text: unknown): string | undefined => {
  if (typeof text === "string") {
    return text;
  }

  if (
    typeof text === "object" &&
    text !== null &&
    "text" in text &&
    typeof (text as { text?: unknown }).text === "string"
  ) {
    return (text as { text: string }).text;
  }

  return undefined;
};

const extractBackupCodesFromFlow = (flow: SettingsFlow): string[] => {
  let codesText: string | undefined;

  for (const { group, attributes } of flow.ui.nodes) {
    if (
      group === "lookup_secret" &&
      isUiNodeTextAttributes(attributes) &&
      attributes.id === "lookup_secret_codes"
    ) {
      codesText = getUiTextValue(attributes.text);
      break;
    }
  }

  if (!codesText) {
    return [];
  }

  // Extract backup codes directly by pattern rather than stripping HTML first.
  // Kratos may return codes in an HTML-formatted string (with <br> tags, etc.),
  // but we only care about the alphanumeric code values themselves.
  //
  // Two formats have been observed across Kratos versions:
  // - Older releases: groups of four alphanumeric characters separated by
  //   hyphens, e.g. `ABCD-EFGH`.
  // - v26+: a single run of eight alphanumeric characters with no separator,
  //   e.g. `5ne3l4ll`.
  //
  // The optional hyphen makes the pattern match both variants.
  const regexMatches = codesText.match(/[A-Z0-9]{4}(?:-?[A-Z0-9]{4})+/gi);
  if (regexMatches?.length) {
    return regexMatches;
  }

  // Fallback: replace <br> with newlines, then use DOMParser to safely extract
  // plain text. DOMParser creates an inert document — no scripts execute, no
  // resources load, and no event handlers fire, unlike innerHTML on a live element.
  // The data comes from Kratos in any case.
  const withNewlines = codesText.replace(/<br\s*\/?>/gi, "\n");
  const parsed = new DOMParser().parseFromString(withNewlines, "text/html");
  const plainText = parsed.body.textContent;

  return plainText
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
};

const SecurityPage: NextPageWithLayout = () => {
  const router = useRouter();
  const { flow: flowId } = router.query;
  const { authenticatedUser } = useAuthInfo();
  const usernameForPasswordManagers =
    authenticatedUser?.emails[0]?.address ?? "";

  const [flow, setFlow] = useState<SettingsFlow>();
  const [password, setPassword] = useState("");

  const [totpCode, setTotpCode] = useState("");
  const [showTotpSetupForm, setShowTotpSetupForm] = useState(false);
  const [showTotpDisableForm, setShowTotpDisableForm] = useState(false);
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [showBackupCodesModal, setShowBackupCodesModal] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>();

  const [updatingPassword, setUpdatingPassword] = useState(false);
  const [enablingTotp, setEnablingTotp] = useState(false);
  const [disablingTotp, setDisablingTotp] = useState(false);
  const [regeneratingBackupCodes, setRegeneratingBackupCodes] = useState(false);
  const [confirmingBackupCodes, setConfirmingBackupCodes] = useState(false);

  const { handleFlowError } = useKratosErrorHandler({
    flowType: "settings",
    setFlow,
    setErrorMessage,
  });

  const persistFlowIdInUrl = useCallback(
    (settingsFlow: SettingsFlow) => {
      void router.push(
        {
          pathname: "/settings/security",
          query: { flow: settingsFlow.id },
        },
        undefined,
        { shallow: true },
      );
    },
    [router],
  );

  const submitSettingsUpdate = useCallback(
    async (
      currentFlow: SettingsFlow,
      updateSettingsFlowBody: UpdateSettingsFlowBody,
    ): Promise<SettingsFlow | undefined> =>
      oryKratosClient
        .updateSettingsFlow({
          flow: String(currentFlow.id),
          updateSettingsFlowBody,
        })
        .then(({ data }) => {
          setFlow(data);
          return data;
        })
        .catch(handleFlowError)
        .catch((error: AxiosError<SettingsFlow>) => {
          if (error.response?.status === 400) {
            setFlow(error.response.data);
            return undefined;
          }

          setErrorMessage(
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- response body is typed as SettingsFlow but non-400 responses have a different shape
            error.response?.data?.ui?.messages?.[0]?.text ??
              "Something went wrong. Please try again.",
          );
          return undefined;
        }),
    [handleFlowError, setErrorMessage],
  );

  useEffect(() => {
    if (!router.isReady || flow) {
      return;
    }

    const initFlow = (data: SettingsFlow) => {
      setFlow(data);
    };

    if (flowId) {
      oryKratosClient
        .getSettingsFlow({ id: String(flowId) })
        .then(({ data }) => initFlow(data))
        .catch(handleFlowError);
      return;
    }

    oryKratosClient
      .createBrowserSettingsFlow()
      .then(({ data }) => initFlow(data))
      .catch(handleFlowError);
  }, [flow, flowId, handleFlowError, router.isReady]);

  const passwordInputUiNode = useMemo(
    () =>
      flow?.ui.nodes.find(
        ({ group, attributes }) =>
          group === "password" &&
          isUiNodeInputAttributes(attributes) &&
          attributes.name === "password",
      ),
    [flow],
  );

  const totpNodes = useMemo(
    () => flow?.ui.nodes.filter(({ group }) => group === "totp") ?? [],
    [flow],
  );

  const totpCodeUiNode = useMemo(
    () =>
      totpNodes.find(
        ({ attributes }) =>
          isUiNodeInputAttributes(attributes) &&
          attributes.name === "totp_code",
      ),
    [totpNodes],
  );

  const isTotpEnabled = useMemo(
    () =>
      totpNodes.some(
        ({ attributes }) =>
          isUiNodeInputAttributes(attributes) &&
          attributes.name === "totp_unlink",
      ),
    [totpNodes],
  );

  useEffect(() => {
    if (isTotpEnabled) {
      setShowTotpSetupForm(false);
      return;
    }

    setShowTotpDisableForm(false);
  }, [isTotpEnabled]);

  const executeDisableTotp = useCallback(
    async (currentFlow: SettingsFlow) => {
      setDisablingTotp(true);
      setShowTotpDisableForm(true);
      persistFlowIdInUrl(currentFlow);

      try {
        // Step 1: Unlink TOTP.
        const unlinkedFlow = await submitSettingsUpdate(currentFlow, {
          method: "totp",
          totp_unlink: true,
          csrf_token: mustGetCsrfTokenFromFlow(currentFlow),
        });

        if (!unlinkedFlow) {
          return;
        }

        // Step 2: Remove backup codes. Kratos enforces AAL2 as long as
        // any second factor is present, so leaving orphan backup codes
        // behind after unlinking TOTP would lock the user out at next
        // login — they'd be asked for an authenticator code they no
        // longer have.
        const clearedFlow = await submitSettingsUpdate(unlinkedFlow, {
          method: "lookup_secret",
          lookup_secret_disable: true,
          csrf_token: mustGetCsrfTokenFromFlow(unlinkedFlow),
        });

        if (!clearedFlow) {
          setErrorMessage(
            "TOTP was disabled, but backup codes could not be removed. " +
              "Please reload the page and try again to avoid being locked out.",
          );
          return;
        }

        setShowTotpDisableForm(false);
      } finally {
        setDisablingTotp(false);
      }
    },
    [submitSettingsUpdate, persistFlowIdInUrl],
  );

  const totpQrCodeDataUri = useMemo(() => {
    for (const { attributes } of totpNodes) {
      if (
        isUiNodeImageAttributes(attributes) &&
        typeof attributes.src === "string"
      ) {
        return attributes.src;
      }
    }

    return undefined;
  }, [totpNodes]);

  const totpSecretKey = useMemo<string | undefined>(() => {
    for (const { attributes } of totpNodes) {
      if (
        isUiNodeTextAttributes(attributes) &&
        attributes.id === "totp_secret_key"
      ) {
        const text = getUiTextValue(attributes.text);

        if (text) {
          return text;
        }
      }
    }

    return undefined;
  }, [totpNodes]);

  const handlePasswordSubmit: FormEventHandler<HTMLFormElement> = (event) => {
    event.preventDefault();

    if (!flow || !password) {
      return;
    }

    let csrfToken: string;
    try {
      csrfToken = mustGetCsrfTokenFromFlow(flow);
    } catch {
      setErrorMessage("Could not find CSRF token. Please reload the page.");
      return;
    }

    setUpdatingPassword(true);
    persistFlowIdInUrl(flow);

    // No manual session refresh — Kratos enforces `privileged_session_max_age`
    // server-side. If the session is stale, Kratos returns
    // `session_refresh_required` and the error handler takes over.
    // This works for both password and SSO-only users.
    void submitSettingsUpdate(flow, {
      method: "password",
      password,
      csrf_token: csrfToken,
    })
      .then((nextFlow) => {
        if (nextFlow) {
          setPassword("");
        }
      })
      .finally(() => setUpdatingPassword(false));
  };

  const handleEnableTotpSubmit: FormEventHandler<HTMLFormElement> = (event) => {
    event.preventDefault();

    if (!flow || !totpCode) {
      return;
    }

    setEnablingTotp(true);
    persistFlowIdInUrl(flow);

    void submitSettingsUpdate(flow, {
      method: "totp",
      totp_code: totpCode,
      csrf_token: mustGetCsrfTokenFromFlow(flow),
    })
      .then(async (totpEnabledFlow) => {
        if (!totpEnabledFlow) {
          return;
        }

        setShowTotpSetupForm(false);
        setTotpCode("");

        const flowWithBackupCodes = await submitSettingsUpdate(
          totpEnabledFlow,
          {
            method: "lookup_secret",
            lookup_secret_regenerate: true,
            csrf_token: mustGetCsrfTokenFromFlow(totpEnabledFlow),
          },
        );

        if (!flowWithBackupCodes) {
          // Step 2 of enrolment failed. TOTP is active but there are no
          // backup codes. Don't leave the user thinking everything is
          // fine — without codes they have no recovery path if they lose
          // their authenticator device.
          setErrorMessage(
            "TOTP was enabled, but backup codes could not be generated. " +
              "Please use the “Regenerate backup codes” button to try again.",
          );
          return;
        }

        const regeneratedCodes =
          extractBackupCodesFromFlow(flowWithBackupCodes);

        if (regeneratedCodes.length === 0) {
          setErrorMessage(
            "TOTP was enabled, but no backup codes were returned. " +
              "Please use the “Regenerate backup codes” button to try again.",
          );
          return;
        }

        setBackupCodes(regeneratedCodes);
        setShowBackupCodesModal(true);
      })
      .finally(() => setEnablingTotp(false));
  };

  const handleDisableTotpSubmit: FormEventHandler<HTMLFormElement> = (
    event,
  ) => {
    event.preventDefault();

    if (!flow) {
      return;
    }

    // Kratos enforces `privileged_session_max_age` server-side. If the
    // session is stale, the first `submitSettingsUpdate` call inside
    // `executeDisableTotp` will fail with `session_refresh_required` and
    // the error handler will redirect to re-authenticate.
    void executeDisableTotp(flow);
  };

  const handleRegenerateBackupCodes = () => {
    if (!flow) {
      return;
    }

    setRegeneratingBackupCodes(true);
    persistFlowIdInUrl(flow);

    void submitSettingsUpdate(flow, {
      method: "lookup_secret",
      lookup_secret_regenerate: true,
      csrf_token: mustGetCsrfTokenFromFlow(flow),
    })
      .then((nextFlow) => {
        if (!nextFlow) {
          return;
        }

        const regeneratedCodes = extractBackupCodesFromFlow(nextFlow);

        if (regeneratedCodes.length > 0) {
          setBackupCodes(regeneratedCodes);
          setShowBackupCodesModal(true);
        } else {
          setErrorMessage(
            "Could not extract backup codes from the response. " +
              "Please reload the page and try again.",
          );
        }
      })
      .finally(() => setRegeneratingBackupCodes(false));
  };

  const handleConfirmBackupCodesSaved = () => {
    if (!flow) {
      setShowBackupCodesModal(false);
      return;
    }

    setConfirmingBackupCodes(true);

    void submitSettingsUpdate(flow, {
      method: "lookup_secret",
      lookup_secret_confirm: true,
      csrf_token: mustGetCsrfTokenFromFlow(flow),
    })
      .then((nextFlow) => {
        if (nextFlow) {
          setShowBackupCodesModal(false);
        } else {
          setErrorMessage(
            "We couldn't record that you've saved your backup codes. Please try again.",
          );
        }
      })
      .finally(() => setConfirmingBackupCodes(false));
  };

  return (
    <>
      <SettingsPageContainer
        heading="Security"
        subHeading="Manage your password and two-factor authentication"
      >
        <Box
          px={5}
          py={4}
          sx={{ display: "flex", flexDirection: "column", gap: 5 }}
        >
          <Box component="form" onSubmit={handlePasswordSubmit}>
            <input
              type="text"
              name="username"
              autoComplete="username"
              value={usernameForPasswordManagers}
              readOnly
              tabIndex={-1}
              aria-hidden
              style={{
                position: "absolute",
                width: 1,
                height: 1,
                margin: -1,
                padding: 0,
                border: 0,
                clipPath: "inset(100%)",
                overflow: "hidden",
                whiteSpace: "nowrap",
              }}
            />
            <Typography
              variant="regularTextLabels"
              sx={{ mb: 1.5, display: "block" }}
            >
              Password
            </Typography>
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
              <TextField
                label="New password"
                type="password"
                autoComplete="new-password"
                placeholder="Enter your new password"
                value={password}
                onChange={({ target }) => setPassword(target.value)}
                error={
                  !!passwordInputUiNode?.messages.find(
                    ({ type }) => type === "error",
                  )
                }
                helperText={passwordInputUiNode?.messages.map(
                  ({ id, text }) => <Typography key={id}>{text}</Typography>,
                )}
                required
              />
            </Box>
            <Box mt={1.5}>
              <Button type="submit" disabled={!password || updatingPassword}>
                {updatingPassword ? "Updating password..." : "Update password"}
              </Button>
            </Box>
          </Box>

          <Divider />

          <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <Typography variant="regularTextLabels" sx={{ display: "block" }}>
              Two-factor authentication
            </Typography>

            {isTotpEnabled ? (
              <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
                <Typography sx={{ color: ({ palette }) => palette.gray[80] }}>
                  TOTP is enabled for your account.
                </Typography>
                {showTotpDisableForm ? (
                  <Box
                    component="form"
                    onSubmit={handleDisableTotpSubmit}
                    sx={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 1.5,
                    }}
                  >
                    <Typography
                      sx={{ color: ({ palette }) => palette.gray[80] }}
                    >
                      Disabling TOTP will also remove your backup codes. You
                      will sign in with just your password until you enable a
                      second factor again.
                    </Typography>
                    <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap" }}>
                      <Button
                        type="submit"
                        variant="secondary"
                        data-testid="confirm-disable-totp-button"
                        disabled={disablingTotp}
                      >
                        {disablingTotp
                          ? "Disabling..."
                          : "Yes, disable two-factor authentication"}
                      </Button>
                      <Button
                        type="button"
                        variant="tertiary"
                        data-testid="cancel-disable-totp-button"
                        onClick={() => {
                          setShowTotpDisableForm(false);
                          setErrorMessage(undefined);
                        }}
                      >
                        Cancel
                      </Button>
                    </Box>
                  </Box>
                ) : (
                  <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap" }}>
                    <Button
                      type="button"
                      variant="secondary"
                      data-testid="disable-totp-button"
                      onClick={() => {
                        setShowTotpDisableForm(true);
                        setErrorMessage(undefined);
                      }}
                    >
                      Disable TOTP
                    </Button>
                    <Button
                      type="button"
                      data-testid="regenerate-backup-codes-button"
                      onClick={handleRegenerateBackupCodes}
                      disabled={regeneratingBackupCodes}
                    >
                      {regeneratingBackupCodes
                        ? "Regenerating backup codes..."
                        : "Regenerate backup codes"}
                    </Button>
                  </Box>
                )}
              </Box>
            ) : showTotpSetupForm ? (
              <Box
                component="form"
                onSubmit={handleEnableTotpSubmit}
                sx={{ display: "flex", flexDirection: "column", gap: 2 }}
              >
                <Typography
                  variant="smallTextParagraphs"
                  sx={{ color: ({ palette }) => palette.gray[80] }}
                >
                  Scan the QR code with your authenticator app, then enter the
                  6-digit code to enable TOTP.
                </Typography>
                {totpQrCodeDataUri ? (
                  <Box
                    component="img"
                    src={totpQrCodeDataUri}
                    alt="TOTP QR code"
                    data-testid="totp-qr-code"
                    sx={{
                      width: 180,
                      height: 180,
                      borderRadius: 1,
                      border: ({ palette }) => `1px solid ${palette.gray[30]}`,
                    }}
                  />
                ) : null}
                {totpSecretKey ? (
                  <Box>
                    <Typography
                      variant="smallTextParagraphs"
                      sx={({ palette }) => ({
                        color: palette.gray[80],
                        mb: 0.75,
                        display: "block",
                      })}
                    >
                      {totpQrCodeDataUri
                        ? "Alternatively, use the secret key below for manual setup."
                        : "QR code unavailable. Use the secret key below for manual setup."}
                    </Typography>
                    <Typography
                      component="code"
                      data-testid="totp-secret-key"
                      sx={{
                        display: "inline-block",
                        py: 1,
                        px: 2,
                        borderRadius: 1,
                        background: ({ palette }) => palette.gray[20],
                        fontFamily: "monospace",
                      }}
                    >
                      {totpSecretKey}
                    </Typography>
                  </Box>
                ) : null}
                <TextField
                  label="Authenticator code"
                  type="text"
                  autoComplete="one-time-code"
                  placeholder="Enter your 6-digit code"
                  value={totpCode}
                  onChange={({ target }) => setTotpCode(target.value)}
                  error={
                    !!totpCodeUiNode?.messages.find(
                      ({ type }) => type === "error",
                    )
                  }
                  helperText={totpCodeUiNode?.messages.map(({ id, text }) => (
                    <Typography key={id}>{text}</Typography>
                  ))}
                  required
                  inputProps={{ inputMode: "numeric" }}
                />
                <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap" }}>
                  <Button
                    type="submit"
                    data-testid="enable-totp-button"
                    disabled={!totpCode || enablingTotp}
                  >
                    {enablingTotp ? "Enabling..." : "Confirm and enable TOTP"}
                  </Button>
                  <Button
                    type="button"
                    variant="tertiary"
                    data-testid="cancel-enable-totp-button"
                    onClick={() => {
                      setTotpCode("");
                      setShowTotpSetupForm(false);
                      setErrorMessage(undefined);
                    }}
                  >
                    Cancel
                  </Button>
                </Box>
              </Box>
            ) : (
              <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
                <Typography sx={{ color: ({ palette }) => palette.gray[80] }}>
                  TOTP is currently disabled for your account.
                </Typography>
                <Box>
                  <Button
                    type="button"
                    data-testid="show-enable-totp-form-button"
                    onClick={() => {
                      setShowTotpSetupForm(true);
                      setErrorMessage(undefined);
                    }}
                  >
                    Enable TOTP
                  </Button>
                </Box>
              </Box>
            )}
          </Box>

          {flow?.ui.messages?.map((message) => (
            <Typography key={message.id}>
              {formatKratosMessage(message)}
            </Typography>
          ))}
          {errorMessage ? <Typography>{errorMessage}</Typography> : null}
        </Box>
      </SettingsPageContainer>

      <Modal
        open={showBackupCodesModal}
        onClose={() => setShowBackupCodesModal(false)}
      >
        <Box sx={{ p: 4 }} data-testid="backup-codes-modal">
          <Typography variant="h3" sx={{ mb: 1.5 }}>
            Backup codes
          </Typography>
          <Typography sx={{ mb: 2 }}>
            These codes will only be shown once. Save them securely.
          </Typography>
          <Grid container spacing={1.25} sx={{ mb: 2 }}>
            {backupCodes.map((backupCode) => (
              <Grid item xs={12} sm={6} key={backupCode}>
                <Box
                  data-testid="backup-code-item"
                  sx={({ palette }) => ({
                    border: `1px solid ${palette.gray[30]}`,
                    borderRadius: 1,
                    px: 1.5,
                    py: 1,
                    background: palette.gray[20],
                    fontFamily: "monospace",
                  })}
                >
                  {backupCode}
                </Box>
              </Grid>
            ))}
          </Grid>
          <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap" }}>
            <Button
              type="button"
              variant="secondary"
              data-testid="copy-backup-codes-button"
              onClick={() => {
                navigator.clipboard
                  .writeText(backupCodes.join("\n"))
                  .catch(() => {
                    // Surface the failure rather than silently swallowing
                    // it — losing backup codes leads to account lockout if
                    // the user later loses their authenticator.
                    setErrorMessage(
                      "We couldn't copy your backup codes to the clipboard. " +
                        "Please copy them manually before closing this dialog.",
                    );
                  });
              }}
              disabled={backupCodes.length === 0}
            >
              Copy codes
            </Button>
            <Button
              type="button"
              data-testid="confirm-backup-codes-button"
              onClick={handleConfirmBackupCodesSaved}
              disabled={confirmingBackupCodes}
            >
              {confirmingBackupCodes ? "Saving..." : "I've saved my codes"}
            </Button>
          </Box>
        </Box>
      </Modal>
    </>
  );
};

SecurityPage.getLayout = (page) => getSettingsLayout(page);

export default SecurityPage;
