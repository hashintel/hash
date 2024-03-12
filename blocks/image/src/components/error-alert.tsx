import type { FunctionComponent } from "react";
import { tw } from "twind";

import Cross from "../svgs/cross";

type ImageErrorAlertProps = { error: string | null; onClearError: () => void };

export const ErrorAlert: FunctionComponent<ImageErrorAlertProps> = ({
  error,
  onClearError,
}) => (
  <div
    className={tw`w-96 mx-auto mb-4 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative border-solid`}
    role="alert"
  >
    <div className={tw`mr-5`}>
      <strong className={tw`font-bold`}>Error</strong>
      <span className={tw`block sm:inline ml-2 `}>{error}</span>
    </div>

    <button
      aria-label="Close"
      type="button"
      onClick={onClearError}
      className={tw`absolute top-0 bottom-0 right-0 px-4 py-3 border-0 focus:outline-none bg-transparent box-border cursor-pointer`}
    >
      <Cross />
    </button>
  </div>
);
