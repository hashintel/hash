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
      onLoggedIn={() => {
        void refetch();
        router.push("/");
      }}
    />
  ));

  useLayoutEffect(() => {
    showLoginModal();
  }, []);

  return null;
};

export default LoginPage;
