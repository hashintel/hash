import { NextPage } from "next";
import { LoginModal } from "../components/Modals/AuthModal/LoginModal";
import { useRouter } from "next/router";
import { useModal } from "react-modal-hook";
import { useLayoutEffect } from "react";
import { useUser } from "../components/hooks/useUser";

const LoginPage: NextPage = () => {
  const { refetch } = useUser();
  const router = useRouter();

  const [showLoginModal, hideLoginModal] = useModal(() => (
    <LoginModal
      show={true}
      close={hideLoginModal}
      closeIconHidden
      onLoggedIn={({ accountSignupComplete }) => {
        void refetch().then(() => {
          // Only when account sign-up is complete redirect the user to the homepage
          if (accountSignupComplete) void router.push("/");
          // Otherwise the user will be redirected to the /signup page in `src/pages/_app`
        });
      }}
    />
  ));

  useLayoutEffect(() => {
    showLoginModal();
  }, [showLoginModal]);

  return null;
};

export default LoginPage;
