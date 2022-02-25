import React, { useMemo } from "react";
import { BlockComponent } from "blockprotocol/react";

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
};

export const App: BlockComponent<AppProps> = ({
  avatar,
  employer,
  email,
  link,
  name,
}) => {
  const { name: employerName, position } = employer ?? {};

  const linkData = useMemo(() => {
    if (!link) {
      return null;
    }

    return new URL(link);
  }, [link]);

  return (
    <div className="person-container">
      {avatar && (
        <img
          alt={`${name ? `${name}'s ` : ""}avatar`}
          className="avatar-desktop"
          src={avatar}
        />
      )}
      <div>
        <div className="person-name-container">
          {avatar && (
            <img
              alt={`${name ? `${name}'s ` : ""}avatar`}
              className="avatar-mobile"
              src={avatar}
            />
          )}
          <div className="person-name">{name}</div>
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
                <div className="person-link">
                  <svg
                    width="12"
                    height="10"
                    viewBox="0 0 12 10"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M10.5 0.5H1.5C0.65625 0.5 0 1.17969 0 2V8C0 8.84375 0.65625 9.5 1.5 9.5H10.5C11.3203 9.5 12 8.84375 12 8V2C12 1.17969 11.3203 0.5 10.5 0.5ZM1.5 1.625H10.5C10.6875 1.625 10.875 1.8125 10.875 2V2.53906L6.96094 5.77344C6.42188 6.21875 5.55469 6.21875 5.01562 5.77344L1.125 2.53906V2C1.125 1.8125 1.28906 1.625 1.5 1.625ZM10.5 8.375H1.5C1.28906 8.375 1.125 8.21094 1.125 8V3.99219L4.3125 6.66406C4.78125 7.03906 5.36719 7.25 6 7.25C6.60938 7.25 7.19531 7.03906 7.66406 6.66406L10.875 3.99219V8C10.875 8.21094 10.6875 8.375 10.5 8.375Z"
                      fill="#91A5BA"
                    />
                  </svg>

                  <a href={`mailto:${email}`}>{email}</a>
                </div>
              )}

              {link && (
                <div className="person-link">
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 16 13"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M14.4922 1.00781C13.8594 0.351562 13.0391 0.0234375 12.1953 0.0234375C11.3047 0 10.4141 0.328125 9.75781 1.00781L8.39844 2.32031C8.72656 2.50781 9.05469 2.71875 9.33594 2.97656L10.5312 1.80469C10.9531 1.35938 11.5391 1.125 12.125 1.125C12.6875 1.125 13.2734 1.35938 13.6953 1.80469C14.5859 2.67188 14.5859 4.10156 13.6953 4.96875L11.0469 7.61719C10.2031 8.48438 8.72656 8.48438 7.88281 7.61719C7.4375 7.19531 7.20312 6.63281 7.20312 6.04688C7.20312 5.625 7.32031 5.22656 7.53125 4.89844C7.27344 4.64062 6.89844 4.5 6.52344 4.5C6.5 4.5 6.47656 4.5 6.47656 4.5C6.21875 4.96875 6.07812 5.48438 6.07812 6.02344C6.07812 6.9375 6.42969 7.78125 7.08594 8.41406C7.71875 9.04688 8.5625 9.39844 9.45312 9.39844C10.3672 9.39844 11.2109 9.07031 11.8438 8.41406L14.4922 5.76562C15.1484 5.10938 15.4766 4.24219 15.5 3.375C15.5 2.50781 15.1484 1.66406 14.4922 1.00781ZM5.44531 10.2188C5.02344 10.6406 4.4375 10.875 3.85156 10.875C3.28906 10.875 2.70312 10.6406 2.28125 10.2188C1.39062 9.32812 1.39062 7.89844 2.28125 7.03125L4.92969 4.38281C5.77344 3.51562 7.25 3.51562 8.09375 4.38281C8.53906 4.80469 8.77344 5.36719 8.77344 5.97656C8.77344 6.375 8.65625 6.77344 8.44531 7.125C8.70312 7.35938 9.07812 7.5 9.45312 7.5C9.47656 7.5 9.5 7.5 9.5 7.5C9.75781 7.03125 9.89844 6.51562 9.89844 5.97656C9.89844 5.0625 9.54688 4.21875 8.89062 3.58594C8.25781 2.95312 7.41406 2.60156 6.52344 2.60156C5.60938 2.60156 4.76562 2.95312 4.13281 3.58594L1.48438 6.25781C0.828125 6.91406 0.5 7.78125 0.5 8.64844C0.5 9.49219 0.828125 10.3594 1.48438 11.0156C2.09375 11.625 2.86719 11.9766 3.6875 12C4.60156 12.0469 5.53906 11.7188 6.24219 11.0156L7.57812 9.70312C7.25 9.51562 6.92188 9.30469 6.64062 9.04688L5.44531 10.2188Z"
                      fill="#91A5BA"
                    />
                  </svg>

                  <a href={link}>
                    {linkData?.hostname}
                    {linkData?.pathname !== "/" ? linkData?.pathname : ""}
                  </a>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};
