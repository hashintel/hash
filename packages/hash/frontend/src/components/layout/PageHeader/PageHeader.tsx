import Link from "next/link";
import { VoidFunctionComponent } from "react";
import { tw } from "twind";

export const PageHeader: VoidFunctionComponent = () => {
  return (
    <header className={tw`bg-white py-4`}>
      <nav className={tw`container mx-auto flex justify-end`}>
        <Link href="/login">
          <a
            className={tw`bg(blue-500 hover:blue-700) text(white visited:white) font-bold border(none hover:none)  py-2 px-5 rounded  no-underline`}
          >
            Sign in
          </a>
        </Link>
      </nav>
    </header>
  );
};
