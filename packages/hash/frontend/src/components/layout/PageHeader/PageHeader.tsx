import Link from "next/link";
import { VoidFunctionComponent } from "react";
import { useModal } from "react-modal-hook";
import { tw } from "twind";
import { useLogout } from "../../hooks/useLogout";

import { useUser } from "../../hooks/useUser";
import { LoginModal } from "../../Modals/AuthModal/LoginModal";
import { AccountDropdown } from "./AccountDropdown";
import { Button } from "../../forms/Button";

export const PageHeader: VoidFunctionComponent = () => {
  const { user, refetch } = useUser();
  const { logout } = useLogout();

  const [showLoginModal, hideLoginModal] = useModal(() => (
    <LoginModal
      show
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
                <Button className="mr-3">Sign up</Button>
              </a>
            </Link>
            <Button onClick={showLoginModal}>Sign in</Button>
          </>
        )}
      </nav>
    </header>
  );
};
