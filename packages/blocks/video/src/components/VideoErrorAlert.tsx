import React, { VFC } from "react";
import { tw } from "twind";
import Cross from "../svgs/Cross";

type VideoErrorAlertProps = { errorString: string; onClearError: () => void };

export const VideoErrorAlert: VFC<VideoErrorAlertProps> = ({
  errorString,
  onClearError,
}) => {
  return (
    <div
      className={tw`w-96 mx-auto mb-4 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative`}
      role="alert"
    >
      <div className={tw`mr-5`}>
        <strong className={tw`font-bold`}>Error</strong>
        <span className={tw`block sm:inline ml-2 `}>{errorString}</span>
      </div>

      <button
        type="button"
        onClick={onClearError}
        className={tw`absolute top-0 bottom-0 right-0 px-4 py-3`}
      >
        <Cross />
      </button>
    </div>
  );
};
