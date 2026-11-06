export const markLight = ({ id }: { id: string }) => (
  <g fill="#111111">
    <defs>
      <path
        id={`${id}-a`}
        d="M413 217c0 6-3 10-8 10h-296c-5 0-9-5-9-10V165c0-30 22-55 50-55H363c28 0 50 25 50 55v52"
      />
    </defs>
    <use href={`#${id}-a`} fill="#34a853" />
    <use href={`#${id}-a`} transform="translate(0,56)" fill="#fbbc04" />
    <use href={`#${id}-a`} transform="translate(0,112)" fill="#ea4335" />
    <path
      d="M299 283c23 6 48 0 66-15l48-38v117c0 30-22 55-50 55H149c-28 0-50-25-50-55V233l200 51"
      fill="#4285f4"
    />
  </g>
);
export const markDark = ({ id }: { id: string }) => (
  <g fill="#111111">
    <defs>
      <path
        id={`${id}-a`}
        d="M413 217c0 6-3 10-8 10h-296c-5 0-9-5-9-10V165c0-30 22-55 50-55H363c28 0 50 25 50 55v52"
      />
    </defs>
    <use href={`#${id}-a`} fill="#34a853" />
    <use href={`#${id}-a`} transform="translate(0,56)" fill="#fbbc04" />
    <use href={`#${id}-a`} transform="translate(0,112)" fill="#ea4335" />
    <path
      d="M299 283c23 6 48 0 66-15l48-38v117c0 30-22 55-50 55H149c-28 0-50-25-50-55V233l200 51"
      fill="#4285f4"
    />
  </g>
);
