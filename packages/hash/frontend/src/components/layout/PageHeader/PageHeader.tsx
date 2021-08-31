import Link from "next/link";
import { VoidFunctionComponent } from "react";
import { useModal } from "react-modal-hook";
import { tw } from "twind";
import { useLogout } from "../../hooks/useLogout";

import { useUser } from "../../hooks/useUser";
import { LoginModal } from "../../Modals/AuthModal/LoginModal";
import { AccountDropdown } from "./AccountDropdown";

export const PageHeader: VoidFunctionComponent = () => {
  const { user, refetch } = useUser();
  const { logout } = useLogout();

  const [showLoginModal, hideLoginModal] = useModal(() => (
    <LoginModal
      show={true}
      onClose={hideLoginModal}
      onLoggedIn={() => {
        void refetch();
        hideLoginModal();
      }}
    />
  ));

  return (
    <header
      className={tw`bg-white h-16 flex items-center border(b-1 gray-300)`}
    >
      <nav className={tw`container mx-auto flex justify-end`}>
        {user ? (
          <AccountDropdown name={user.properties.shortname!} logout={logout} />
        ) : (
          <>
            <Link href="/signup">
              <a className={tw`pb-0 border-b-0 hover:border-b-0`}>
                <button
                  className={tw`bg(blue-500 hover:blue-700) text(white visited:white) font-bold border(none hover:none)  py-2 px-5 rounded  no-underline mr-3`}
                >
                  Sign up
                </button>
              </a>
            </Link>
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
