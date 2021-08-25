import { NextPage } from "next";
import { useRouter } from "next/router";
import { useLayoutEffect } from "react";
import { useModal } from "react-modal-hook";

import { SignupModal } from "../components/Modals/AuthModal/SignupModal";

const SignupPage: NextPage = () => {
  const router = useRouter();

  const [showSignupModal, hideSignupModal] = useModal(() => (
    <SignupModal
      show={true}
      close={hideSignupModal}
      closeIconHidden
      onSignupComplete={() => router.push('/')}
    />
  ));

  useLayoutEffect(() => {
    showSignupModal();
  }, []);

  return null;
};

export default SignupPage;
