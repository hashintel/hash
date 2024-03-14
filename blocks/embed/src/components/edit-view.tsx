import type { FormEvent, FunctionComponent } from "react";
import { tw } from "twind";

import Cross from "../svgs/cross";
import Loader from "../svgs/loader";

type EditViewProps = {
  errorString: string;
  setErrorString: (x: string) => void;
  loading: boolean;
  buttonText: string;
  bottomText: string;
  placeholderText: string;
  onChangeEmbedUrl: (url: string) => void;
  embedUrl: string;
  onSubmit: () => Promise<void>;
};

export const EditView: FunctionComponent<EditViewProps> = ({
  errorString,
  setErrorString,
  loading,
  buttonText,
  bottomText,
  placeholderText,
  onChangeEmbedUrl,
  embedUrl,
  onSubmit,
}) => {
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void onSubmit();
  };

  return (
    <>
      {errorString && (
        <div
          className={tw`w-96 mx-auto mb-4 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative`}
          style={{ overflowWrap: "anywhere" }}
          role="alert"
        >
          <div className={tw`mr-5`}>
            <strong className={tw`font-bold`}>Error</strong>
            <span className={tw`block sm:inline ml-2 `}>{errorString}</span>
          </div>
          <button
            aria-label="Close"
            onClick={() => setErrorString("")}
            type="button"
            className={tw`absolute focus:outline-none top-0 bottom-0 right-0 px-4 py-3`}
          >
            <Cross />
          </button>
        </div>
      )}

      <div
        className={tw`w-96 mx-auto bg-white rounded-sm shadow-md overflow-hidden text-center p-4 border-2 border-gray-200`}
      >
        <form className={tw`mb-0`} onSubmit={handleSubmit}>
          <div>
            <input
              required
              className={tw`border-solid text-base px-1.5 py-1 rounded-sm border-2 border-gray-200 bg-gray-50 focus:outline-none focus:ring focus:border-blue-300 w-full`}
              onChange={(event) => onChangeEmbedUrl(event.target.value)}
              value={embedUrl}
              type="url"
              placeholder={placeholderText}
            />
          </div>
          <div className={tw`mt-4`}>
            <button
              className={tw`border-none text-base bg-blue-400 rounded-sm hover:bg-blue-500 focus:bg-blue-600 py-1 text-white w-full flex items-center justify-center`}
              type="submit"
            >
              {loading && <Loader />}
              {buttonText}
            </button>
          </div>
          <div className={tw`text-sm text-gray-400 mt-4`}>{bottomText}</div>
        </form>
      </div>
    </>
  );
};
