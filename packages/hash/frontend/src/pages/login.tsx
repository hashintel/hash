import { NextPage } from "next";
import { LoginModal } from "../components/Modals/AuthModal/LoginModal";
import { useRouter } from "next/router";
import { useModal } from "react-modal-hook";
import { useLayoutEffect } from "react";

const LoginPage: NextPage = () => {
  const router = useRouter();

  const [showLoginModal, hideLoginModal] = useModal(() => (
    <LoginModal
      show={true}
      close={hideLoginModal}
      closeIconHidden
      onLoggedIn={() => router.push("/")}
    />
  ));

  useLayoutEffect(() => {
    showLoginModal();
  }, []);

  return null;
};

export default LoginPage;
