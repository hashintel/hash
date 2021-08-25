import { VoidFunctionComponent } from "react";
import { useModal } from "react-modal-hook";
import { tw } from "twind";
import { useLogout } from "../../hooks/useLogout";

import { useUser } from "../../hooks/useUser";
import { LoginModal } from "../../Modals/AuthModal/LoginModal";
import { SignupModal } from "../../Modals/AuthModal/SignupModal";
import { AccountDropdown } from "./AccountDropdown";

export const PageHeader: VoidFunctionComponent = () => {
  const { user, refetch } = useUser();
  const { logout } = useLogout();

  const [showLoginModal, hideLoginModal] = useModal(() => (
    <LoginModal
      show={true}
      close={hideLoginModal}
      onLoggedIn={() => {
        void refetch();
        hideLoginModal();
      }}
    />
  ));

  const [showSignupModal, hideSignupModal] = useModal(({}) => (
    <SignupModal
      show={true}
      close={hideSignupModal}
      onSignupComplete={() => {
        void refetch();
        hideSignupModal();
      }}
    />
  ));

  return (
    <header
      className={tw`bg-white h-16 flex items-center border(b-1 gray-300)`}
    >
      <nav className={tw`container mx-auto flex justify-end`}>
        {user ? (
          <AccountDropdown name={user.properties.shortname} logout={logout} />
        ) : (
          <>
            <button
              onClick={showSignupModal}
              className={tw`bg(blue-500 hover:blue-700) text(white visited:white) font-bold border(none hover:none)  py-2 px-5 rounded  no-underline mr-3`}
            >
              Sign up
            </button>
            <button
              onClick={showLoginModal}
              className={tw`bg(blue-500 hover:blue-700) text(white visited:white) font-bold border(none hover:none)  py-2 px-5 rounded  no-underline`}
            >
              Sign in
            </button>
          </>
        )}
      </nav>
    </header>
  );
};
