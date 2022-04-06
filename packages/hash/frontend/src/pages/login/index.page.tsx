import { NextPage } from "next";
import { useRouter } from "next/router";
import { LoginModal } from "./login-modal";
import { useUser } from "../../components/hooks/useUser";
import {
  isParsedInvitationEmailQuery,
  isParsedInvitationLinkQuery,
} from "../shared/auth-utils";

const Page: NextPage = () => {
  const { refetch } = useUser();
  const router = useRouter();

  return (
    <LoginModal
      show
      onLoggedIn={({ accountSignupComplete, accountId }) => {
        void refetch().then(() => {
          // redirect to invite page if login occured from invitation link
          if (accountSignupComplete) {
            if (
              isParsedInvitationEmailQuery(router.query) ||
              isParsedInvitationLinkQuery(router.query)
            ) {
              void router.push({ pathname: "/invite", query: router.query });
              return;
            }

            void router.push(`/${accountId}`);
          }
        });
      }}
    />
  );
};

export default Page;
