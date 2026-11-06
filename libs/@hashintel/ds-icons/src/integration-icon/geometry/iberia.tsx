/* Adapted from Soaring Symbols. Bounds and theme colors adjusted; app tiles composed. Brand names and artwork remain trademarks of their respective owners.

MIT License

Copyright (c) 2024 Anh Thang

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE. */
export const markLight = ({ id }: { id: string }) => (
  <g fill="currentColor">
    <defs>
      <linearGradient
        x1="75.453"
        y1="9.36"
        x2="103.641"
        y2="37.653"
        id={`${id}-a`}
        gradientTransform="matrix(.7767 0 0 -.44675 -57.879 26.46)"
        gradientUnits="userSpaceOnUse"
      >
        <stop stopColor="#A61C22" offset="0%" />
        <stop stopColor="#DC1C2E" offset="50%" />
        <stop stopColor="#DC1C2E" offset="100%" />
      </linearGradient>
      <linearGradient
        x1="87.158"
        y1=".691"
        x2="106.265"
        y2="19.51"
        id={`${id}-b`}
        gradientTransform="matrix(.76935 0 0 -.45101 -57.879 11.563)"
        gradientUnits="userSpaceOnUse"
      >
        <stop stopColor="#ED7417" offset="0%" />
        <stop stopColor="#FACD08" offset="85%" />
        <stop stopColor="#FACD08" offset="100%" />
      </linearGradient>
    </defs>
    <path
      d="M4.24 16.741 0 21.021c14.719 0 18.189-3.46 20.213-8.17l1.7-4.434c-4.958.143-12.441 3.066-17.673 8.324"
      fill={`url(#${id}-a)`}
      fillRule="evenodd"
      stroke="none"
      strokeWidth=".589057"
    />
    <path
      d="m14.127 6.73-4.771 4.833c4.53-3.254 9.047-5.217 13.547-5.723L24 2.978c-6.662 0-7.57 1.457-9.873 3.752"
      fill={`url(#${id}-b)`}
      fillRule="evenodd"
      stroke="none"
      strokeWidth=".589057"
    />
  </g>
);
export const markDark = ({ id }: { id: string }) => (
  <g fill="currentColor">
    <defs>
      <linearGradient
        x1="75.453"
        y1="9.36"
        x2="103.641"
        y2="37.653"
        id={`${id}-a`}
        gradientTransform="matrix(.7767 0 0 -.44675 -57.879 26.46)"
        gradientUnits="userSpaceOnUse"
      >
        <stop stopColor="#DF4148" offset="0%" />
        <stop stopColor="#E53647" offset="50%" />
        <stop stopColor="#E53647" offset="100%" />
      </linearGradient>
      <linearGradient
        x1="87.158"
        y1=".691"
        x2="106.265"
        y2="19.51"
        id={`${id}-b`}
        gradientTransform="matrix(.76935 0 0 -.45101 -57.879 11.563)"
        gradientUnits="userSpaceOnUse"
      >
        <stop stopColor="#ED7417" offset="0%" />
        <stop stopColor="#FACD08" offset="85%" />
        <stop stopColor="#FACD08" offset="100%" />
      </linearGradient>
    </defs>
    <path
      d="M4.24 16.741 0 21.021c14.719 0 18.189-3.46 20.213-8.17l1.7-4.434c-4.958.143-12.441 3.066-17.673 8.324"
      fill={`url(#${id}-a)`}
      fillRule="evenodd"
      stroke="none"
      strokeWidth=".589057"
    />
    <path
      d="m14.127 6.73-4.771 4.833c4.53-3.254 9.047-5.217 13.547-5.723L24 2.978c-6.662 0-7.57 1.457-9.873 3.752"
      fill={`url(#${id}-b)`}
      fillRule="evenodd"
      stroke="none"
      strokeWidth=".589057"
    />
  </g>
);
export const logoLight = ({ id }: { id: string }) => (
  <svg viewBox="0 24.85943 64 14.24452" fill="currentColor">
    <defs>
      <linearGradient
        x1="19.394"
        y1="-22.423"
        x2="19.394"
        y2="45.316"
        id={`${id}-a`}
        gradientTransform="matrix(1.16626 0 0 -.18177 0 34.814)"
        gradientUnits="userSpaceOnUse"
      >
        <stop stopColor="#A61C22" offset="0%" />
        <stop stopColor="#DA1C2D" offset="80%" />
        <stop stopColor="#DA1C2D" offset="100%" />
      </linearGradient>
      <linearGradient
        x1="75.453"
        y1="9.36"
        x2="103.641"
        y2="37.653"
        id={`${id}-b`}
        gradientTransform="matrix(.60708 0 0 -.3492 .001 43.302)"
        gradientUnits="userSpaceOnUse"
      >
        <stop stopColor="#A61C22" offset="0%" />
        <stop stopColor="#DC1C2E" offset="50%" />
        <stop stopColor="#DC1C2E" offset="100%" />
      </linearGradient>
      <linearGradient
        x1="87.158"
        y1=".691"
        x2="106.265"
        y2="19.51"
        id={`${id}-c`}
        gradientTransform="matrix(.60134 0 0 -.35252 .001 31.658)"
        gradientUnits="userSpaceOnUse"
      >
        <stop stopColor="#ED7417" offset="0%" />
        <stop stopColor="#FACD08" offset="85%" />
        <stop stopColor="#FACD08" offset="100%" />
      </linearGradient>
    </defs>
    <path
      d="M39.437 26.356c-.567.843-1.189 1.895-1.873 3.244-.69 1.357-1.312 2.748-1.697 3.806h2.3c.141-.441.313-.887.494-1.306h3.78c.183.417.345.837.495 1.306h2.3a42.846 42.846 0 0 0-1.692-3.798c-.686-1.35-1.3-2.408-1.878-3.252zm1.112 1.666c.475.85.9 1.712 1.375 2.773h-2.745c.462-1.04.888-1.902 1.37-2.773zm-17.604-1.666a35.832 35.832 0 0 0-.17 3.524c0 1.146.058 2.3.172 3.526h2.18a36.162 36.162 0 0 1-.17-2.617h2.194c.16.176.422.512.697.947.32.504.568 1 .843 1.67h2.438c-.32-.61-.667-1.162-1.188-1.897-.298-.419-.58-.76-.837-1.015.914-.322 1.48-1.094 1.48-2.032 0-.537-.192-1.044-.527-1.395-.476-.492-1.215-.71-2.398-.71zm2.077 1.32h1.918c.706 0 1.05.087 1.27.32.13.132.208.341.208.562 0 .38-.196.716-.54.927h-2.923c.001-.521.024-1.115.067-1.808zm-10.792-1.32a39.508 39.508 0 0 0-.172 3.529c0 1.141.077 2.395.172 3.522h6.727c-.035-.47-.062-.9-.087-1.406h-4.58a22.688 22.688 0 0 1-.052-1.49h4.224v-1.33h-4.224c0-.386.013-.95.052-1.42h4.574c.023-.494.05-.909.095-1.405zm-9.601 0a35.702 35.702 0 0 0-.171 3.524c0 1.146.052 2.268.17 3.526h4.158c1.47 0 2.376-.17 2.939-.555.433-.297.701-.888.701-1.543 0-.77-.44-1.386-1.212-1.7.514-.289.84-.845.84-1.445 0-.557-.16-.942-.521-1.249-.606-.515-1.717-.558-2.899-.558zm2.075 1.334h1.844c.746 0 .994.057 1.208.271.109.111.174.305.174.521 0 .299-.12.555-.339.725H6.639a24.9 24.9 0 0 1 .065-1.517zm-.067 2.794h2.655c.384 0 .58.052.752.198a.658.658 0 0 1 .236.54c0 .242-.07.431-.215.575-.206.193-.498.276-1.006.276H6.704a20.985 20.985 0 0 1-.067-1.59Zm26.09-4.127a34.16 34.16 0 0 0-.172 3.584c.003 1.194.05 2.342.172 3.465h1.877c.127-1.117.169-2.269.172-3.466a36.553 36.553 0 0 0-.17-3.583zm-32.555 0A34.168 34.168 0 0 0 0 29.94c.003 1.194.05 2.342.172 3.465H2.05c.126-1.117.168-2.269.171-3.466a36.53 36.53 0 0 0-.17-3.583z"
      fill={`url(#${id}-a)`}
      fillRule="evenodd"
      stroke="none"
      strokeWidth=".460421"
    />
    <path
      d="m48.555 35.706-3.314 3.345c11.505 0 14.217-2.704 15.8-6.386l1.328-3.466c-3.876.112-9.725 2.397-13.814 6.507"
      fill={`url(#${id}-b)`}
      fillRule="evenodd"
      stroke="none"
      strokeWidth=".460421"
    />
    <path
      d="m56.283 27.881-3.73 3.777c3.541-2.543 7.072-4.077 10.59-4.473L64 24.949c-5.207 0-5.916 1.138-7.717 2.932"
      fill={`url(#${id}-c)`}
      fillRule="evenodd"
      stroke="none"
      strokeWidth=".460421"
    />
  </svg>
);
export const logoDark = ({ id }: { id: string }) => (
  <svg viewBox="0 24.85943 64 14.24452" fill="currentColor">
    <defs>
      <linearGradient
        x1="19.394"
        y1="-22.423"
        x2="19.394"
        y2="45.316"
        id={`${id}-a`}
        gradientTransform="matrix(1.16626 0 0 -.18177 0 34.814)"
        gradientUnits="userSpaceOnUse"
      >
        <stop stopColor="#DF4148" offset="0%" />
        <stop stopColor="#E53747" offset="80%" />
        <stop stopColor="#E53747" offset="100%" />
      </linearGradient>
      <linearGradient
        x1="75.453"
        y1="9.36"
        x2="103.641"
        y2="37.653"
        id={`${id}-b`}
        gradientTransform="matrix(.60708 0 0 -.3492 .001 43.302)"
        gradientUnits="userSpaceOnUse"
      >
        <stop stopColor="#DF4148" offset="0%" />
        <stop stopColor="#E53647" offset="50%" />
        <stop stopColor="#E53647" offset="100%" />
      </linearGradient>
      <linearGradient
        x1="87.158"
        y1=".691"
        x2="106.265"
        y2="19.51"
        id={`${id}-c`}
        gradientTransform="matrix(.60134 0 0 -.35252 .001 31.658)"
        gradientUnits="userSpaceOnUse"
      >
        <stop stopColor="#ED7417" offset="0%" />
        <stop stopColor="#FACD08" offset="85%" />
        <stop stopColor="#FACD08" offset="100%" />
      </linearGradient>
    </defs>
    <path
      d="M39.437 26.356c-.567.843-1.189 1.895-1.873 3.244-.69 1.357-1.312 2.748-1.697 3.806h2.3c.141-.441.313-.887.494-1.306h3.78c.183.417.345.837.495 1.306h2.3a42.846 42.846 0 0 0-1.692-3.798c-.686-1.35-1.3-2.408-1.878-3.252zm1.112 1.666c.475.85.9 1.712 1.375 2.773h-2.745c.462-1.04.888-1.902 1.37-2.773zm-17.604-1.666a35.832 35.832 0 0 0-.17 3.524c0 1.146.058 2.3.172 3.526h2.18a36.162 36.162 0 0 1-.17-2.617h2.194c.16.176.422.512.697.947.32.504.568 1 .843 1.67h2.438c-.32-.61-.667-1.162-1.188-1.897-.298-.419-.58-.76-.837-1.015.914-.322 1.48-1.094 1.48-2.032 0-.537-.192-1.044-.527-1.395-.476-.492-1.215-.71-2.398-.71zm2.077 1.32h1.918c.706 0 1.05.087 1.27.32.13.132.208.341.208.562 0 .38-.196.716-.54.927h-2.923c.001-.521.024-1.115.067-1.808zm-10.792-1.32a39.508 39.508 0 0 0-.172 3.529c0 1.141.077 2.395.172 3.522h6.727c-.035-.47-.062-.9-.087-1.406h-4.58a22.688 22.688 0 0 1-.052-1.49h4.224v-1.33h-4.224c0-.386.013-.95.052-1.42h4.574c.023-.494.05-.909.095-1.405zm-9.601 0a35.702 35.702 0 0 0-.171 3.524c0 1.146.052 2.268.17 3.526h4.158c1.47 0 2.376-.17 2.939-.555.433-.297.701-.888.701-1.543 0-.77-.44-1.386-1.212-1.7.514-.289.84-.845.84-1.445 0-.557-.16-.942-.521-1.249-.606-.515-1.717-.558-2.899-.558zm2.075 1.334h1.844c.746 0 .994.057 1.208.271.109.111.174.305.174.521 0 .299-.12.555-.339.725H6.639a24.9 24.9 0 0 1 .065-1.517zm-.067 2.794h2.655c.384 0 .58.052.752.198a.658.658 0 0 1 .236.54c0 .242-.07.431-.215.575-.206.193-.498.276-1.006.276H6.704a20.985 20.985 0 0 1-.067-1.59Zm26.09-4.127a34.16 34.16 0 0 0-.172 3.584c.003 1.194.05 2.342.172 3.465h1.877c.127-1.117.169-2.269.172-3.466a36.553 36.553 0 0 0-.17-3.583zm-32.555 0A34.168 34.168 0 0 0 0 29.94c.003 1.194.05 2.342.172 3.465H2.05c.126-1.117.168-2.269.171-3.466a36.53 36.53 0 0 0-.17-3.583z"
      fill={`url(#${id}-a)`}
      fillRule="evenodd"
      stroke="none"
      strokeWidth=".460421"
    />
    <path
      d="m48.555 35.706-3.314 3.345c11.505 0 14.217-2.704 15.8-6.386l1.328-3.466c-3.876.112-9.725 2.397-13.814 6.507"
      fill={`url(#${id}-b)`}
      fillRule="evenodd"
      stroke="none"
      strokeWidth=".460421"
    />
    <path
      d="m56.283 27.881-3.73 3.777c3.541-2.543 7.072-4.077 10.59-4.473L64 24.949c-5.207 0-5.916 1.138-7.717 2.932"
      fill={`url(#${id}-c)`}
      fillRule="evenodd"
      stroke="none"
      strokeWidth=".460421"
    />
  </svg>
);
