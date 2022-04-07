import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
  VFC,
  ClipboardEventHandler,
} from "react";
import { tw } from "twind";

import { LogoIcon, HashIcon, KeyboardReturnIcon } from "../../shared/icons";
import { InviteHeader } from "./invite-header";
import { InvitationInfo, SYNTHETIC_LOADING_TIME_MS } from "./auth-utils";

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
  return units.length >= 4 && units?.[3]!.length > 0;
};

export const VerifyCode: VFC<VerifyCodeProps> = ({
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
    text: defaultCode || "",
    emailResent: false,
    syntheticLoading: false,
  });

  const { text, emailResent, syntheticLoading } = state;
  const inputRef = useRef<HTMLInputElement>(null);

  const updateState = useCallback((newState) => {
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

  const onSubmit = (evt: React.FormEvent) => {
    evt.preventDefault();
    handleSubmit(text);
  };

  const handleResendCode = async () => {
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
      const valueAfterPasting = currentTarget?.value;
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
    <div className={tw`w-8/12 max-w-4xl`}>
      <LogoIcon className={tw`mb-6`} />
      <div
        className={tw`h-96 mb-9 rounded-2xl bg-white shadow-xl flex justify-center items-center text-center`}
      >
        <div className={tw`w-8/12`}>
          {!!invitationInfo && <InviteHeader invitationInfo={invitationInfo} />}
          <p className={tw`font-bold`}>
            A verification code has been sent to{" "}
            <span>
              {isShortname(loginIdentifier)
                ? "your primary email address"
                : loginIdentifier}
            </span>
          </p>
          <p className={tw`mb-10`}>
            Click the link in this email or enter the verification phrase below
            to continue
          </p>
          <form className={tw`relative`} onSubmit={onSubmit}>
            <input
              className={tw`block border-b-1 border-gray-300 w-11/12 mx-auto mb-2 py-3 pl-3 pr-20 text-2xl text-center focus:outline-none focus:border-blue-500`}
              onChange={({ target }) =>
                updateState({ text: parseVerificationCodeInput(target.value) })
              }
              onPaste={handleInputPaste}
              value={text}
              ref={inputRef}
              data-testid="verify-code-input"
            />
            <button
              type="submit"
              className={tw`absolute right-0 top-1/2 mr-3 transition-all -translate-y-1/2 flex items-center disabled:opacity-40 disabled:pointer-events-none focus:outline-none text(blue-500 hover:blue-700 focus:blue-600) font-bold py-2 px-2`}
              disabled={!isInputValid() || loading}
            >
              {loading ? (
                <>
                  <span className={tw`mr-1`}>Loading</span>
                  <HashIcon className={tw`h-4 w-4 animate-spin`} />
                </>
              ) : (
                <>
                  <span className={tw`mr-1`}>Submit</span>
                  <KeyboardReturnIcon />
                </>
              )}
            </button>
          </form>
          {errorMessage && (
            <span className={tw`text-red-500 text-sm`}>{errorMessage}</span>
          )}
        </div>
      </div>
      <div className={tw`flex justify-between`}>
        <button
          type="button"
          className={tw`focus:outline-none border(b-1 transparent hover:current focus:current)`}
          onClick={goBack}
        >
          &larr; <span className={tw`ml-1`}>Try logging in another way</span>
        </button>
        {emailResent ? (
          <div className={tw`flex items-center`}>
            <span className={tw`mr-1`}>No email yet?</span>
            <span className={tw`font-bold text-green-500`}>Email Resent</span>
          </div>
        ) : (
          <div className={tw`flex items-center`}>
            <span className={tw`mr-1`}>No email yet?</span>
            <button
              type="button"
              className={tw`text-blue-500 focus:text-blue-700 hover:text-blue-700 disabled:opacity-50 font-bold focus:outline-none flex items-center`}
              onClick={handleResendCode}
              disabled={requestCodeLoading || syntheticLoading}
            >
              <span>Resend email</span>
              {(requestCodeLoading || syntheticLoading) && (
                <HashIcon className={tw`h-3 w-3 ml-1 animate-spin`} />
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
