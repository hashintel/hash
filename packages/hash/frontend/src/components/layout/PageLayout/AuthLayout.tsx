import React, { ReactNode, VoidFunctionComponent } from "react";
import { tw } from "twind";

import bgPattern from "../../../assets/images/auth-bg-pattern.png";
import Logo from "../../../assets/svg/logo.svg";
import { IconHash } from "../../Icons/IconHash";

export type AuthLayoutProps = {
  children: ReactNode;
  onClose?: () => void;
  showTopLogo?: boolean;
  loading?: boolean;
};

export const AuthLayout: VoidFunctionComponent<AuthLayoutProps> = ({
  children,
  onClose,
  showTopLogo,
  loading,
}) => {
  if (loading) {
    return (
      <div
        className={tw`fixed z-10 top-0 left-0 right-0 bottom-0 flex items-center justify-center`}
      >
        <IconHash className={tw`h-48 w-48 ml-1 animate-spin-slow`} />
      </div>
    );
  }

  return (
    <div className={tw`fixed inset-0 bg-white`}>
      <div className={tw`relative z-10 h-screen overflow-y-scroll border-4`}>
        <div
          className={tw`py-10 flex justify-center ${
            showTopLogo ? "" : "invisible"
          }`}
        >
          <Logo />
        </div>

        <div className={tw`pt-24 pb-10 flex justify-center`}>{children}</div>
      </div>

      <div className={tw`absolute right-0 top-0 bottom-0`}>
        {/* TODO: Remove next-images and resolve https://github.com/vercel/next.js/discussions/25752 */}
        <img alt="" src={bgPattern as any} className={tw`h-screen`} />
      </div>
      {onClose && (
        <button
          type="button"
          className={tw`absolute top-8 right-8 text-3xl bg(hover:black focus:black hover:opacity-10 focus:opacity-10) focus:outline-none leading-none h-12 w-12 flex items-center justify-center rounded-full`}
          onClick={onClose}
        >
          &times;
        </button>
      )}
    </div>
  );
};
