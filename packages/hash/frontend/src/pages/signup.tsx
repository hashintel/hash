import { NextPage } from "next";
import { useRouter } from "next/router";
import { useLayoutEffect } from "react";
import { useModal } from "react-modal-hook";
import { useUser } from "../components/hooks/useUser";

import { SignupModal } from "../components/Modals/AuthModal/SignupModal";

const SignupPage: NextPage = () => {
  const { refetch } = useUser();
  const router = useRouter();

  const [showSignupModal, hideSignupModal] = useModal(() => (
    <SignupModal
      show={true}
      close={hideSignupModal}
      closeIconHidden
      onSignupComplete={() => {
        void refetch();
        void router.push("/");
      }}
    />
  ));

  useLayoutEffect(() => {
    showSignupModal();
  }, [showSignupModal]);

  return null;
};

export default SignupPage;
