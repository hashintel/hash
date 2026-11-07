export const markLight = ({ id: _id }: { id: string }) => (
  <g fill="#E34F26">
    <path fill="#e34f26" d="M41 460L0 0h451l-41 460-185 52" />
    <path fill="#ef652a" d="M226 472l149-41 35-394H226" />
    <path
      fill="#ecedee"
      d="M226 208h-75l-5-58h80V94H84l15 171h127zm0 147l-64-17-4-45h-56l7 89 117 32z"
    />
    <path
      fill="#fff"
      d="M226 265h69l-7 73-62 17v59l115-32 16-174H226zm0-171v56h136l5-56z"
    />
  </g>
);
export const markDark = ({ id: _id }: { id: string }) => (
  <g fill="#E34F26">
    <path fill="#e34f26" d="M41 460L0 0h451l-41 460-185 52" />
    <path fill="#ef652a" d="M226 472l149-41 35-394H226" />
    <path
      fill="#ecedee"
      d="M226 208h-75l-5-58h80V94H84l15 171h127zm0 147l-64-17-4-45h-56l7 89 117 32z"
    />
    <path
      fill="#fff"
      d="M226 265h69l-7 73-62 17v59l115-32 16-174H226zm0-171v56h136l5-56z"
    />
  </g>
);
export const logoLight = ({ id: _id }: { id: string }) => (
  <svg
    viewBox="74.0955 -0.47445 363.809 512.94891"
    fill="#111111"
    preserveAspectRatio="xMidYMid meet"
  >
    <path d="M108.4 0h23v22.8h21.2V0h23v69h-23V46h-21v23h-23.2M206 23h-20.3V0h63.7v23H229v46h-23M259.5 0h24.1l14.8 24.3L313.2 0h24.1v69h-23V34.8l-16.1 24.8l-16.1-24.8v34.2h-22.6M348.7 0h23v46.2h32.6V69h-55.6" />
    <path fill="#E44D26" d="M107.6 471l-33-370.4h362.8l-33 370.2L255.7 512" />
    <path fill="#F16529" d="M256 480.5V131H404.3L376 447" />
    <path
      fill="#EBEBEB"
      d="M142 176.3h114v45.4h-64.2l4.2 46.5h60v45.3H154.4M156.4 336.3H202l3.2 36.3 50.8 13.6v47.4l-93.2-26"
    />
    <path
      fill="#FFFFFF"
      d="M369.6 176.3H255.8v45.4h109.6M361.3 268.2H255.8v45.4h56l-5.3 59-50.7 13.6v47.2l93-25.8"
    />
  </svg>
);
export const logoDark = ({ id: _id }: { id: string }) => (
  <svg
    viewBox="74.0955 -0.47445 363.809 512.94891"
    fill="#F5F7FA"
    preserveAspectRatio="xMidYMid meet"
  >
    <path d="M108.4 0h23v22.8h21.2V0h23v69h-23V46h-21v23h-23.2M206 23h-20.3V0h63.7v23H229v46h-23M259.5 0h24.1l14.8 24.3L313.2 0h24.1v69h-23V34.8l-16.1 24.8l-16.1-24.8v34.2h-22.6M348.7 0h23v46.2h32.6V69h-55.6" />
    <path fill="#E44D26" d="M107.6 471l-33-370.4h362.8l-33 370.2L255.7 512" />
    <path fill="#F16529" d="M256 480.5V131H404.3L376 447" />
    <path
      fill="#EBEBEB"
      d="M142 176.3h114v45.4h-64.2l4.2 46.5h60v45.3H154.4M156.4 336.3H202l3.2 36.3 50.8 13.6v47.4l-93.2-26"
    />
    <path
      fill="#FFFFFF"
      d="M369.6 176.3H255.8v45.4h109.6M361.3 268.2H255.8v45.4h56l-5.3 59-50.7 13.6v47.2l93-25.8"
    />
  </svg>
);
const WordmarkLightSource = logoLight;
export const wordmarkLight = ({ id }: { id: string }) => (
  <svg viewBox="107.912107 -0.47445 296.816858 70.049586" overflow="hidden">
    <defs>
      <clipPath id={`${id}-wordmark-crop`} clipPathUnits="userSpaceOnUse">
        <rect
          x="107.912107"
          y="-0.47445"
          width="296.816858"
          height="70.049586"
        />
      </clipPath>
    </defs>
    <g clipPath={`url(#${id}-wordmark-crop)`}>
      <svg x="74.0955" y="-0.47445" width="363.809" height="512.94891">
        <WordmarkLightSource id={id} />
      </svg>
    </g>
  </svg>
);
const WordmarkDarkSource = logoDark;
export const wordmarkDark = ({ id }: { id: string }) => (
  <svg viewBox="107.912107 -0.47445 296.816858 70.049586" overflow="hidden">
    <defs>
      <clipPath id={`${id}-wordmark-crop`} clipPathUnits="userSpaceOnUse">
        <rect
          x="107.912107"
          y="-0.47445"
          width="296.816858"
          height="70.049586"
        />
      </clipPath>
    </defs>
    <g clipPath={`url(#${id}-wordmark-crop)`}>
      <svg x="74.0955" y="-0.47445" width="363.809" height="512.94891">
        <WordmarkDarkSource id={id} />
      </svg>
    </g>
  </svg>
);
