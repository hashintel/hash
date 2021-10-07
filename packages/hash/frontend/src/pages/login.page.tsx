import { NextPage } from "next";
import { useRouter } from "next/router";
import { LoginModal } from "../components/Modals/AuthModal/LoginModal";
import { useUser } from "../components/hooks/useUser";

const LoginPage: NextPage = () => {
  const { refetch } = useUser();
  const router = useRouter();

  return (
    <LoginModal
      show
      onLoggedIn={({ accountSignupComplete, accountId }) => {
        void refetch().then(() => {
          // Only when account sign-up is complete redirect the user to their account page
          if (accountSignupComplete) void router.push(`/${accountId}`);
          // Otherwise the user will be redirected to the /signup page in `src/pages/_app`
        });
      }}
    />
  );
};

export default LoginPage;
