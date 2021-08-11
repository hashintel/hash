import Link from "next/link";
import { VoidFunctionComponent } from "react";
import { tw } from "twind";
import { useLogout } from "../../hooks/useLogout";

import { useUser } from "../../hooks/useUser";
import { AccountDropdown } from "./AccountDropdown";

export const PageHeader: VoidFunctionComponent = () => {
  const { user } = useUser();
  const { logout } = useLogout();

  return (
    <header className={tw`bg-white py-4 border(b-1 gray-300)`}>
      <nav className={tw`container mx-auto flex justify-end`}>
        {user ? (
          <AccountDropdown name={user.properties.shortname} logout={logout} />
        ) : (
          <Link href="/login">
            <a
              className={tw`bg(blue-500 hover:blue-700) text(white visited:white) font-bold border(none hover:none)  py-2 px-5 rounded  no-underline`}
            >
              Sign in
            </a>
          </Link>
        )}
      </nav>
    </header>
  );
};
