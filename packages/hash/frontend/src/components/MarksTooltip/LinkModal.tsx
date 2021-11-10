import React, { FormEvent, useMemo, useRef, useState } from "react";
import { tw } from "twind";
import LanguageIcon from "@material-ui/icons/Language";
import DeleteIcon from "@material-ui/icons/Delete";

type LinkModalProps = {
  defaultLinkMarkHref?: string;
  updateLink: (href: string) => void;
  removeLink: () => void;
};

export const LinkModal: React.VFC<LinkModalProps> = ({
  defaultLinkMarkHref,
  updateLink,
  removeLink,
}) => {
  const [linkHref, setLinkHref] = useState(defaultLinkMarkHref ?? "");
  const linkModalRef = useRef<HTMLDivElement>(null);
  const linkInputRef = useRef<HTMLInputElement>(null);

  const handleUpdateLink = (evt: FormEvent) => {
    evt.preventDefault();
    updateLink(linkHref);
    // closeTooltip();
  };

  const handleRemoveLink = () => {
    removeLink();

    // closeTooltip();
  };

  if (!linkHref && defaultLinkMarkHref) {
    setLinkHref(defaultLinkMarkHref);
  }

  return (
    <div
      className={tw`absolute z-10 w-80 mt-2 left-1/2 -translate-x-1/2 shadow-lg border-1 bg-white rounded-md`}
      ref={linkModalRef}
    >
      <form className={tw`flex px-4 pt-4 pb-3`} onSubmit={handleUpdateLink}>
        <input
          className={tw`block w-full px-2 py-1 text-sm border-1 outline-none rounded-sm focus:outline-none focus:border-gray-500`}
          type="text"
          onChange={(evt) => setLinkHref(evt.target.value)}
          value={linkHref}
          ref={linkInputRef}
          placeholder={linkHref ? "Edit link" : "Paste link"}
        />
      </form>
      {linkHref && (
        <div className={tw`text-gray-700`}>
          <div className={tw`text-xs`}>
            <p className={tw`text-xxs px-4 uppercase mb-2`}>Linked To</p>
            <button
              className={tw`flex hover:bg-gray-200 text-left w-full px-4 py-1.5`}
            >
              <LanguageIcon className={tw`!text-base mr-1`} />
              <a href={linkHref} target="_blank">
                <p className={tw`text-sm leading-none mb-0.5`}>
                  {linkHref}
                </p>
                <span className={tw`font-light`}>Web page</span>
              </a>
            </button>
          </div>
          <hr className={tw`h-px bg-gray-100`} />
          <ul className={tw`text-sm py-1`}>
            <li>
              <button
                className={tw`hover:bg-gray-200 flex items-center w-full px-4 py-1`}
                onClick={handleRemoveLink}
                type="button"
              >
                <DeleteIcon className={tw`!text-base mr-1`} />
                <span className={tw``}>Remove link</span>
              </button>
            </li>
          </ul>
        </div>
      )}
    </div>
  );
};
