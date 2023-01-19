import { Box } from "@mui/material";
import { useRouter } from "next/router";
import {
  FormEvent,
  FunctionComponent,
  useEffect,
  useRef,
  useState,
} from "react";

import { TextInput } from "../../components/forms/text-input";
import { LogoIcon, SpinnerIcon } from "../../shared/icons";
import { Link } from "../../shared/ui";
import { useAuthInfo } from "../shared/auth-info-context";
import { InvitationInfo } from "../shared/auth-utils";
import { InviteHeader } from "../shared/invite-header";

type SignupIntroProps = {
  handleSubmit: (email: string) => void;
  loading: boolean;
  errorMessage: string;
  invitationInfo: InvitationInfo | null;
};

export const SignupIntro: FunctionComponent<SignupIntroProps> = ({
  handleSubmit,
  loading,
  errorMessage,
  invitationInfo,
}) => {
  const [email, setEmail] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const { authenticatedUser } = useAuthInfo();
  const router = useRouter();

  useEffect(() => {
    inputRef.current?.select();
  }, []);

  useEffect(() => {
    if (authenticatedUser?.accountSignupComplete) {
      void router.push("/");
    }
  }, [authenticatedUser, router]);

  const onSubmit = (evt: FormEvent) => {
    evt.preventDefault();
    handleSubmit(email);
  };

  return (
    <div
      style={{
        alignItems: "center",
        display: "flex",
        flexDirection: "column",
        paddingTop: "6rem",
      }}
    >
      {!!invitationInfo && <InviteHeader invitationInfo={invitationInfo} />}
      <div
        style={{ alignItems: "center", display: "flex", marginBottom: "3rem" }}
      >
        <LogoIcon style={{ marginRight: "1.25rem" }} />
        <h1
          style={{ fontSize: "1.5rem", lineHeight: "2rem", fontWeight: "700" }}
        >
          Sign up
        </h1>
      </div>
      {/* Don't display until sign-up with Google and GitHub are supported
      <button
        style={{"display":"flex","marginBottom":"0.5rem","backgroundColor":"#ffffff","fontSize":"0.875rem","lineHeight":"1.25rem","fontWeight":"700","justifyContent":"center","alignItems":"center","width":"16rem","height":"2.75rem","borderRadius":"0.5rem","borderColor":"#D1D5DB"}}
      >
        <GoogleIcon style={{"marginRight":"0.5rem"}} />
        Continue with Google
      </button>
      <button
        style={{"display":"flex","backgroundColor":"#ffffff","fontSize":"0.875rem","lineHeight":"1.25rem","fontWeight":"700","justifyContent":"center","alignItems":"center","width":"16rem","height":"2.75rem","borderRadius":"0.5rem","borderColor":"#D1D5DB"}}
      >
        <GithubIcon style={{"marginRight":"0.5rem"}} />
        Continue with Github
      </button>
      <div style={{"display":"flex","marginTop":"1rem","marginBottom":"1rem","alignItems":"center","width":"100%"}}>
        <div style={{"backgroundColor":"#E5E7EB","flex":"1 1 0%","height":"1px"}} />
        <em style={{"marginLeft":"0.5rem","marginRight":"0.5rem","color":"#9CA3AF"}}>or</em>
        <div style={{"backgroundColor":"#E5E7EB","flex":"1 1 0%","height":"1px"}} />
      </div>
      */}
      <form
        style={{
          alignItems: "center",
          display: "flex",
          flexDirection: "column",
          marginBottom: "3.5rem",
          width: "16rem",
        }}
        onSubmit={onSubmit}
      >
        <TextInput
          style={{ marginBottom: "0.5rem", width: "16rem" }}
          placeholder="Enter your email address.."
          type="email"
          ref={inputRef}
          onChangeText={setEmail}
        />
        {errorMessage && (
          <span
            style={{
              color: "#EF4444",
              fontSize: "0.875rem",
              lineHeight: "1.25rem",
              marginBottom: "1rem",
              textAlign: "center",
            }}
          >
            {errorMessage}
          </span>
        )}
        <Box
          component="button"
          type="submit"
          sx={{
            alignItems: "center",
            backgroundColor: "#ffffff",
            borderColor: "#D1D5DB",
            borderRadius: "0.5rem",
            borderStyle: "solid",
            cursor: "pointer",
            display: "flex",
            fontSize: "0.875rem",
            fontWeight: "700",
            height: "2.75rem",
            justifyContent: "center",
            lineHeight: "1.25rem",
            width: "16rem",

            "&:hover": {
              borderColor: "#6B7280",
            },

            "&:focus": {
              borderColor: "#6B7280",
              outline: "none",
            },
          }}
        >
          {loading ? (
            <SpinnerIcon
              style={{
                animation: "spin 1s linear infinite",
                height: "1rem",
                width: "1rem",
              }}
            />
          ) : (
            <span>Continue with email</span>
          )}
        </Box>
      </form>
      <Box
        component="p"
        sx={{
          fontSize: "0.875rem",
          lineHeight: "1.25rem",
          textAlign: "center",

          "@media (min-width: 768px)": {
            whiteSpace: "nowrap",
          },
        }}
      >
        Alternatively if you already have a HASH account,{" "}
        {/* @todo convert this to LinkButton on page refactor */}
        <Link
          href={{
            pathname: "/login",
            query: router.query,
          }}
          noLinkStyle
        >
          <Box
            component="button"
            type="button"
            sx={{
              backgroundColor: "transparent",
              borderStyle: "none",
              cursor: "pointer",
              fontWeight: "700",

              "&:focus": {
                outline: "none",
              },
            }}
          >
            Click here to log in
          </Box>
        </Link>
      </Box>
    </div>
  );
};
