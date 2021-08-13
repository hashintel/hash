import { useState } from "react";
import { VoidFunctionComponent } from "react";
import { tw } from "twind";
import { useLogout } from "../../hooks/useLogout";

import { useUser } from "../../hooks/useUser";
import { LoginModal } from "../../Modals/Login/LoginModal";
import { AccountDropdown } from "./AccountDropdown";

export const PageHeader: VoidFunctionComponent = () => {
  const { user, refetch } = useUser();
  const { logout } = useLogout();

  const [showLoginModal, setShowLoginModal] = useState<boolean>(false);

  return (
    <>
      <LoginModal
        show={showLoginModal}
        close={() => setShowLoginModal(false)}
        onLoggedIn={() => {
          void refetch();
          setShowLoginModal(false);
        }}
      />
      <header
        className={tw`bg-white h-16 flex items-center border(b-1 gray-300)`}
      >
        <nav className={tw`container mx-auto flex justify-end`}>
          {user ? (
            <AccountDropdown name={user.properties.shortname} logout={logout} />
          ) : (
            <button
              onClick={() => setShowLoginModal(true)}
              className={tw`bg(blue-500 hover:blue-700) text(white visited:white) font-bold border(none hover:none)  py-2 px-5 rounded  no-underline`}
            >
              Sign in
            </button>
          )}
        </nav>
      </header>
    </>
  );
};
