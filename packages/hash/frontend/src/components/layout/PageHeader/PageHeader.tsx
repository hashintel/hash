import Link from "next/link";
import React from "react";
import { useModal } from "react-modal-hook";
import { tw } from "twind";

import { Button } from "../../forms/Button";
import { useLogout } from "../../hooks/useLogout";
import { useUser } from "../../hooks/useUser";
import { LoginModal } from "../../Modals/AuthModal/LoginModal";
import { AccountDropdown } from "./AccountDropdown";
import { SearchBar } from "./SearchBar";

export const PageHeader: React.VFC = () => {
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
      <div className={tw`h-full`} style={{ width: 310 }} />
      {/* sidebar filler */}
      {user ? (
        <nav className={tw`container mx-auto flex justify-between`}>
          <SearchBar />
          <AccountDropdown name={user.properties.shortname!} logout={logout} />
        </nav>
      ) : (
        <nav className={tw`container mx-auto flex justify-end`}>
          <Link href="/signup">
            <a className={tw`pb-0 border-b-0 hover:border-b-0`}>
              <Button className="mr-3">Sign up</Button>
            </a>
          </Link>
          <Button onClick={showLoginModal}>Sign in</Button>
        </nav>
      )}
    </header>
  );
};
