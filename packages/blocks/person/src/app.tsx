import React, { CSSProperties, useMemo } from "react";
import { BlockComponent } from "blockprotocol/react";
import DOMPurify from "dompurify";

import { MailIcon } from "./icons/mail-icon";
import { LinkIcon } from "./icons/link-icon";

import "./index.css";

type AppProps = {
  avatar?: string;
  email?: string;
  employer?: {
    name: string;
    position: string;
  };
  link?: string;
  name?: string;
  maxWidth?: string | number;
};

export const App: BlockComponent<AppProps> = ({
  avatar,
  employer,
  email,
  link,
  name,
  maxWidth = "400px",
}) => {
  const { name: employerName, position } = employer ?? {};

  const safeAnchor = useMemo(() => {
    if (!link) {
      return null;
    }

    const linkData = new URL(link);

    return DOMPurify.sanitize(
      `<a href="${linkData.href}">${linkData?.hostname}${
        linkData?.pathname !== "/" ? linkData?.pathname : ""
      }</a>`,
      {
        ALLOWED_TAGS: ["a"],
        ALLOWED_ATTR: ["href"],
      },
    );
  }, [link]);

  return (
    <div
      className="person-container"
      style={{ "--person-container-max-width": maxWidth } as CSSProperties}
    >
      {avatar && (
        <img
          alt={`${name ? `${name}'s ` : ""}avatar`}
          className="avatar-desktop"
          src={avatar}
        />
      )}
      <div className="person-text-container">
        <div className="person-name-container">
          {avatar && (
            <img
              alt={`${name ? `${name}'s ` : ""}avatar`}
              className="avatar-mobile"
              src={avatar}
            />
          )}
          <div
            className="person-name"
            style={{ marginBottom: name && employer ? "4px" : undefined }}
          >
            {name}
          </div>
          {employer && (
            <div className="person-employer">
              {position} <span className="person-employer-breaker">at</span>{" "}
              {employerName}
            </div>
          )}
        </div>

        {(email || link) && (
          <>
            <hr />
            <div className="person-links-container">
              {email && (
                <div
                  className="person-link"
                  style={{ marginBottom: email && link ? "4px" : undefined }}
                >
                  <MailIcon />

                  <a href={`mailto:${email}`}>{email}</a>
                </div>
              )}

              {safeAnchor && (
                <div className="person-link">
                  <LinkIcon />
                  {/* eslint-disable-next-line react/no-danger */}
                  <span dangerouslySetInnerHTML={{ __html: safeAnchor }} />
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};
