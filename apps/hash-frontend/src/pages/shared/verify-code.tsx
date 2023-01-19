import { Box } from "@mui/material";
import {
  ClipboardEventHandler,
  FormEvent,
  FunctionComponent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { HashIcon, KeyboardReturnIcon, LogoIcon } from "../../shared/icons";
import { InvitationInfo, SYNTHETIC_LOADING_TIME_MS } from "./auth-utils";
import { InviteHeader } from "./invite-header";

type VerifyCodeProps = {
  defaultCode?: string;
  goBack: () => void;
  loading: boolean;
  errorMessage?: string;
  loginIdentifier: string;
  handleSubmit: (code: string, withSyntheticLoading?: boolean) => void;
  requestCode: () => void | Promise<void>;
  requestCodeLoading: boolean;
  invitationInfo: InvitationInfo | null;
};

const isShortname = (identifier: string) => !identifier.includes("@");

const parseVerificationCodeInput = (inputCode: string) =>
  inputCode.replace(/\s/g, "");

const doesVerificationCodeLookValid = (code: string) => {
  const units = code.split("-");
  return units.length >= 4 && units[3]!.length > 0;
};

export const VerifyCode: FunctionComponent<VerifyCodeProps> = ({
  defaultCode,
  goBack,
  errorMessage,
  loginIdentifier,
  handleSubmit,
  loading,
  requestCode,
  requestCodeLoading,
  invitationInfo,
}) => {
  const [state, setState] = useState({
    text: defaultCode ?? "",
    emailResent: false,
    syntheticLoading: false,
  });

  const { text, emailResent, syntheticLoading } = state;
  const inputRef = useRef<HTMLInputElement>(null);

  const updateState = useCallback((newState: Partial<typeof state>) => {
    setState((prevState) => ({
      ...prevState,
      ...newState,
    }));
  }, []);

  useEffect(() => {
    inputRef.current?.select();
  }, []);

  const isInputValid = useCallback(
    () => doesVerificationCodeLookValid(text),
    [text],
  );

  const onSubmit = (evt: FormEvent) => {
    evt.preventDefault();
    handleSubmit(text);
  };

  const handleResendCode = () => {
    updateState({ syntheticLoading: true });
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    setTimeout(async () => {
      try {
        await requestCode();
        updateState({ emailResent: true, syntheticLoading: false });
        setTimeout(() => updateState({ emailResent: false }), 5000);
      } catch (err) {
        updateState({ syntheticLoading: false });
      }
    }, SYNTHETIC_LOADING_TIME_MS);
  };

  // The handler supports partial code pasting. Use case:
  // 1. Open email, accidentally select all characters but the first one.
  // 2. Manually type in the first character and then paste.
  // 3. The form submits the entire code and not only clipboardData.
  const handleInputPaste: ClipboardEventHandler<HTMLInputElement> = ({
    currentTarget,
  }) => {
    const originalValue = currentTarget.value;

    setImmediate(() => {
      const valueAfterPasting = currentTarget.value;
      if (!valueAfterPasting || originalValue === valueAfterPasting) {
        return;
      }

      const pastedCode = parseVerificationCodeInput(valueAfterPasting);
      if (doesVerificationCodeLookValid(pastedCode)) {
        handleSubmit(pastedCode, true);
      }
    });
  };

  return (
    <div style={{ width: "66.666667%", maxWidth: "56rem" }}>
      <LogoIcon style={{ marginBottom: "1.5rem" }} />
      <div
        style={{
          alignItems: "center",
          backgroundColor: "#ffffff",
          borderRadius: "1rem",
          // @todo use shadows from MUI theme https://app.asana.com/0/1203179076056209/1203480105875518/f
          boxShadow:
            "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
          display: "flex",
          height: "24rem",
          justifyContent: "center",
          marginBottom: "2.25rem",
          textAlign: "center",
        }}
      >
        <div style={{ width: "66.666667%" }}>
          {!!invitationInfo && <InviteHeader invitationInfo={invitationInfo} />}
          <p style={{ fontWeight: "700" }}>
            A verification code has been sent to{" "}
            <span>
              {isShortname(loginIdentifier)
                ? "your primary email address"
                : loginIdentifier}
            </span>
          </p>
          <p style={{ marginBottom: "2.5rem" }}>
            Click the link in this email or enter the verification phrase below
            to continue
          </p>
          <form style={{ position: "relative" }} onSubmit={onSubmit}>
            <Box
              component="input"
              sx={{
                borderColor: "#D1D5DB",
                borderStyle: "solid",
                borderWidth: "0",
                display: "block",
                fontSize: "1.5rem",
                lineHeight: "2rem",
                marginBottom: "0.5rem",
                paddingBottom: "0.75rem",
                paddingLeft: "0.75rem",
                paddingRight: "5rem",
                paddingTop: "0.75rem",
                textAlign: "center",
                width: "91.666667%",

                "&:focus": {
                  outline: "none",
                  borderColor: "#3B82F6",
                },
              }}
              onChange={({ target }) =>
                updateState({ text: parseVerificationCodeInput(target.value) })
              }
              onPaste={handleInputPaste}
              value={text}
              ref={inputRef}
              data-testid="verify-code-input"
            />
            <Box
              component="button"
              type="submit"
              sx={{
                alignItems: "center",
                backgroundColor: "transparent",
                borderStyle: "none",
                color: "#3B82F6",
                cursor: "pointer",
                display: "flex",
                fontWeight: "700",
                marginRight: "0.75rem",
                paddingBottom: "0.5rem",
                paddingLeft: "0.5rem",
                paddingRight: "0.5rem",
                paddingTop: "0.5rem",
                position: "absolute",
                right: "0",
                top: "50%",
                transitionProperty: "all",
                transform: "traslateY(-50%)",

                "&:disabled": {
                  opacity: 0.4,
                  pointerEvents: "none",
                },

                "&:hover": {
                  color: "#1D4ED8",
                },

                "&:focus": {
                  outline: "none",
                  color: "#2563EB",
                },
              }}
              disabled={!isInputValid() || loading}
            >
              {loading ? (
                <>
                  <span style={{ marginRight: "0.25rem" }}>Loading</span>
                  <HashIcon
                    style={{
                      animation: "spin 1s linear infinite",
                      height: "1rem",
                      width: "1rem",
                    }}
                  />
                </>
              ) : (
                <>
                  <span style={{ marginRight: "0.25rem" }}>Submit</span>
                  <KeyboardReturnIcon />
                </>
              )}
            </Box>
          </form>
          {errorMessage && (
            <span
              style={{
                color: "#EF4444",
                fontSize: "0.875rem",
                lineHeight: "1.25rem",
              }}
            >
              {errorMessage}
            </span>
          )}
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <Box
          component="button"
          type="button"
          sx={{
            backgroundColor: "transparent",
            borderColor: "transparent",
            borderStyle: "none",
            cursor: "pointer",

            "&:hover, &:focus": {
              outline: "none",
              borderColor: "currentcolor",
            },
          }}
          onClick={goBack}
        >
          &larr;{" "}
          <span style={{ marginLeft: "0.25rem" }}>
            Try logging in another way
          </span>
        </Box>
        {emailResent ? (
          <div style={{ display: "flex", alignItems: "center" }}>
            <span style={{ marginRight: "0.25rem" }}>No email yet?</span>
            <span style={{ color: "#10B981", fontWeight: "700" }}>
              Email Resent
            </span>
          </div>
        ) : (
          <div style={{ display: "flex", alignItems: "center" }}>
            <span style={{ marginRight: "0.25rem" }}>No email yet?</span>
            <Box
              component="button"
              type="button"
              sx={{
                alignItems: "center",
                backgroundColor: "transparent",
                borderStyle: "none",
                color: "#3B82F6",
                cursor: "pointer",
                display: "flex",
                fontWeight: "700",

                "&:hover, &:focus": {
                  outline: "none",
                  color: "#1D4ED8",
                },

                "&:disabled": {
                  opacity: 0.5,
                },
              }}
              onClick={handleResendCode}
              disabled={requestCodeLoading || syntheticLoading}
            >
              <span>Resend email</span>
              {(requestCodeLoading || syntheticLoading) && (
                <HashIcon
                  style={{
                    animation: "spin 1s linear infinite",
                    height: "0.75rem",
                    marginLeft: "0.25rem",
                    width: "0.75rem",
                  }}
                />
              )}
            </Box>
          </div>
        )}
      </div>
    </div>
  );
};
