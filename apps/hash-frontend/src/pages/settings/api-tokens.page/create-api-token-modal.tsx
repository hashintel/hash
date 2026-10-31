import { useMutation } from "@apollo/client";
import { Box, Stack, Tooltip, Typography } from "@mui/material";
import { addDays, format } from "date-fns";
import { useCallback, useRef, useState } from "react";

import {
  CopyRegularIcon,
  IconButton,
  Modal,
  Select,
  TextField,
} from "@hashintel/design-system";
import { Banner } from "@hashintel/ds-components";

import { createApiTokenMutation } from "../../../graphql/queries/api-token.queries";
import { CheckRegularIcon } from "../../../shared/icons/check-regular-icon";
import { Button, MenuItem } from "../../../shared/ui";
import { DsComponentsScope } from "../../shared/ds-components-scope";

import type {
  CreateApiTokenMutation,
  CreateApiTokenMutationVariables,
} from "../../../graphql/api-types.gen";
import type { CreateApiTokenResponse } from "@local/hash-graph-sdk/api-token";
import type { FunctionComponent } from "react";

const maxNameLength = 128;
const maxLifetimeDays = 366;

const lifetimeOptions = [
  { value: "7", label: "7 days" },
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
  { value: "180", label: "180 days" },
  { value: "365", label: "365 days" },
  { value: "none", label: "No expiration" },
  { value: "custom", label: "Custom…" },
];

export const CreateApiTokenModal: FunctionComponent<{
  open: boolean;
  onClose: () => void;
  onTokenCreated: () => void;
}> = ({ open, onClose, onTokenCreated }) => {
  const [name, setName] = useState("");
  const [lifetime, setLifetime] = useState("365");
  const [customDays, setCustomDays] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [createdToken, setCreatedToken] =
    useState<CreateApiTokenResponse | null>(null);
  const [copied, setCopied] = useState(false);
  const [copyAttempted, setCopyAttempted] = useState(false);

  const [createApiToken, { loading }] = useMutation<
    CreateApiTokenMutation,
    CreateApiTokenMutationVariables
  >(createApiTokenMutation);

  // `loading` is React state and lags a same-tick second submit
  const submittingRef = useRef(false);

  const lifetimeDays =
    lifetime === "none"
      ? null
      : Number.parseInt(lifetime === "custom" ? customDays : lifetime, 10);

  const lifetimeDaysValid =
    lifetimeDays === null ||
    (Number.isInteger(lifetimeDays) &&
      lifetimeDays >= 1 &&
      lifetimeDays <= maxLifetimeDays);

  const handleClose = useCallback(() => {
    if (submittingRef.current) {
      return;
    }

    setName("");
    setLifetime("365");
    setCustomDays("");
    setErrorMessage(null);
    setCreatedToken(null);
    setCopied(false);
    setCopyAttempted(false);
    onClose();
  }, [onClose]);

  const handleSubmit = async () => {
    if (submittingRef.current) {
      return;
    }

    const trimmedName = name.trim();

    if (!trimmedName) {
      setErrorMessage("Please provide a name for the token.");
      return;
    }

    if (!lifetimeDaysValid) {
      setErrorMessage(
        `The lifetime must be between 1 and ${maxLifetimeDays} days.`,
      );
      return;
    }

    setErrorMessage(null);
    submittingRef.current = true;

    try {
      const { data } = await createApiToken({
        variables: { name: trimmedName, lifetimeDays },
      });

      if (data) {
        setCreatedToken(data.createApiToken);
        onTokenCreated();
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Something went wrong creating the token. Please try again.",
      );
    } finally {
      submittingRef.current = false;
    }
  };

  const copyToken = () => {
    if (!createdToken) {
      return;
    }

    navigator.clipboard
      .writeText(createdToken.token)
      .then(() => {
        setErrorMessage(null);
        setCopied(true);
      })
      .catch(() => {
        setErrorMessage(
          "We couldn't copy the token to the clipboard. Please copy it manually.",
        );
      })
      .finally(() => setCopyAttempted(true));
  };

  const mayClose = copied || copyAttempted;
  const mustCopyBeforeClosing = !!createdToken && !mayClose;
  // while creation is in flight, closing would discard the one-time secret
  const dismissalBlocked = loading || mustCopyBeforeClosing;

  return (
    <Modal
      open={open}
      onClose={dismissalBlocked ? undefined : handleClose}
      contentStyle={{ width: { md: 640 } }}
    >
      {createdToken ? (
        <Box>
          <Typography variant="h5" sx={{ fontSize: 22, mb: 1.5 }}>
            Token created
          </Typography>
          <DsComponentsScope sx={{ mb: 2 }}>
            <Banner tone="warning" role="status">
              {/* as="div" dodges the app's global `body, p` typography rule */}
              <Banner.Description as="div">
                This token is only shown once and can't be recovered. Copy it
                now and store it somewhere secure. If you lose it, revoke it and
                create a new one.
              </Banner.Description>
            </Banner>
          </DsComponentsScope>
          <Stack
            direction="row"
            alignItems="center"
            gap={2}
            sx={({ boxShadows, palette }) => ({
              background: palette.gray[90],
              borderRadius: 1.5,
              boxShadow: `${boxShadows.lg}, inset 0 1px 0 rgba(255, 255, 255, 0.12)`,
              mb: 3,
              pl: 2.5,
              pr: 1.5,
              py: 1.5,
            })}
          >
            <Typography
              component="code"
              onCopy={() => setCopied(true)}
              sx={({ palette }) => ({
                color: palette.common.white,
                display: "block",
                flex: 1,
                fontFamily: "monospace",
                fontSize: 14,
                lineHeight: 1.6,
                overflowWrap: "anywhere",
              })}
            >
              {createdToken.token}
            </Typography>
            <Tooltip title={copied ? "Copied!" : "Copy token"}>
              <IconButton
                aria-label="Copy token"
                onClick={copyToken}
                sx={({ palette }) => ({
                  background: palette.common.white,
                  borderRadius: 1,
                  flexShrink: 0,
                  svg: {
                    fontSize: 16,
                    fill: copied ? palette.green[80] : palette.gray[90],
                  },
                  "&:hover": {
                    background: palette.gray[20],
                  },
                })}
              >
                {copied ? <CheckRegularIcon /> : <CopyRegularIcon />}
              </IconButton>
            </Tooltip>
          </Stack>
          <Typography
            variant="smallTextParagraphs"
            sx={({ palette }) => ({
              color: palette.gray[70],
              display: "block",
              mb: 3,
              mt: -1.5,
            })}
          >
            Send it as a bearer token when calling the HASH API –{" "}
            <Box
              component="code"
              sx={({ palette }) => ({
                background: palette.gray[20],
                borderRadius: 0.5,
                fontFamily: "monospace",
                px: 0.5,
              })}
            >
              Authorization: Bearer &lt;token&gt;
            </Box>{" "}
            – and treat it like a password: it grants the same access as your
            account. Never commit it or expose it in client-side code.
          </Typography>
          {errorMessage ? (
            <Typography
              variant="smallTextParagraphs"
              sx={({ palette }) => ({
                color: palette.red[70],
                display: "block",
                mb: 2,
              })}
            >
              {errorMessage}
            </Typography>
          ) : null}
          <Stack direction="row" justifyContent="flex-end">
            <Button size="small" onClick={handleClose} disabled={!mayClose}>
              Done
            </Button>
          </Stack>
        </Box>
      ) : (
        <Box
          component="form"
          onSubmit={(event) => {
            event.preventDefault();
            void handleSubmit();
          }}
        >
          <Typography variant="h5" sx={{ fontSize: 22, mb: 2.5 }}>
            Create an API token
          </Typography>
          <Box mb={2.5}>
            <TextField
              autoFocus
              fullWidth
              label="Name"
              placeholder="e.g. Local development"
              helperText="Give the token a name to help identify it"
              value={name}
              onChange={({ target }) =>
                setName(target.value.slice(0, maxNameLength))
              }
            />
          </Box>
          <Box mb={2.5}>
            <Typography
              component="label"
              htmlFor="api-token-lifetime-select"
              variant="smallTextLabels"
              sx={({ palette }) => ({
                color: palette.gray[70],
                display: "block",
                fontWeight: 500,
                mb: 0.75,
              })}
            >
              Lifetime
            </Typography>
            <Select
              id="api-token-lifetime-select"
              fullWidth
              value={lifetime}
              onChange={({ target }) => setLifetime(target.value)}
            >
              {lifetimeOptions.map(({ value, label }) => (
                <MenuItem key={value} value={value}>
                  {label}
                </MenuItem>
              ))}
            </Select>
            {lifetime === "custom" ? (
              <Box mt={1.5}>
                <TextField
                  fullWidth
                  label="Lifetime in days"
                  placeholder={`1–${maxLifetimeDays}`}
                  type="number"
                  value={customDays}
                  onChange={({ target }) => setCustomDays(target.value)}
                />
              </Box>
            ) : null}
            <Typography
              variant="smallTextParagraphs"
              sx={({ palette }) => ({
                color: palette.gray[60],
                display: "block",
                mt: 1,
              })}
            >
              {lifetimeDays !== null && lifetimeDaysValid
                ? `This token will stop working on ${format(
                    addDays(new Date(), lifetimeDays),
                    "MMMM d, yyyy",
                  )}.`
                : lifetimeDays === null
                  ? "This token will never expire – it works until you revoke it."
                  : ""}
            </Typography>
          </Box>
          {errorMessage ? (
            <Typography
              variant="smallTextParagraphs"
              sx={({ palette }) => ({
                color: palette.red[70],
                display: "block",
                mb: 2,
              })}
            >
              {errorMessage}
            </Typography>
          ) : null}
          <Stack direction="row" justifyContent="space-between" gap={1.5}>
            <Button
              variant="tertiary"
              size="small"
              onClick={handleClose}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              size="small"
              type="submit"
              loading={loading}
              disabled={loading}
            >
              Create token
            </Button>
          </Stack>
        </Box>
      )}
    </Modal>
  );
};
