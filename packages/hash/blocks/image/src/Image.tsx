import React, { useState, VoidFunctionComponent } from "react";

import { tw } from "twind";

// @todo make calling it AppProps not necessary
type AppProps = {
  width?: number;
  height?: number;
  initialSrc?: string;
};

export const Image: VoidFunctionComponent<AppProps> = ({
  initialSrc,
  ...props
}) => {
  const [src, setSrc] = useState(initialSrc);
  const [inputText, setInputText] = useState("");
  const [loading, setLoading] = useState(false);
  const [displayAlert, setDisplayAlert] = useState(false);
  const [errorString, setErrorString] = useState("");

  const copyObject = {
    placeholderText: "Enter Image URL",
    buttonText: "Embed Image",
    bottomText: "Works with web-supported image formats",
  };

  const { bottomText, buttonText, placeholderText } = copyObject;

  if (src?.trim()) {
    return <img {...props} src={src} alt="Image block" />;
  }

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    
  };

  return (
    <>
      {displayAlert && (
        <div
          className={tw`max-w-md mx-auto mb-4 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative`}
          role="alert"
        >
          <strong className={tw`font-bold`}>Error</strong>
          <span className={tw`block sm:inline ml-2`}>{errorString}</span>
          <span
            onClick={() => setDisplayAlert(false)}
            className={tw`absolute top-0 bottom-0 right-0 px-4 py-3`}
          >
            <svg
              className={tw`fill-current h-6 w-6 text-red-500`}
              role="button"
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
            >
              <title>Close</title>
              <path d="M14.348 14.849a1.2 1.2 0 0 1-1.697 0L10 11.819l-2.651 3.029a1.2 1.2 0 1 1-1.697-1.697l2.758-3.15-2.759-3.152a1.2 1.2 0 1 1 1.697-1.697L10 8.183l2.651-3.031a1.2 1.2 0 1 1 1.697 1.697l-2.758 3.152 2.758 3.15a1.2 1.2 0 0 1 0 1.698z" />
            </svg>
          </span>
        </div>
      )}

      <div
        className={tw`max-w-md mx-auto bg-white rounded-sm shadow-md overflow-hidden text-center p-4 border-2 border-gray-200`}
      >
        <form className={tw`mb-0`} onSubmit={onSubmit}>
          <div>
            <input
              className={tw`px-1.5 py-1 rounded-sm border-2 border-gray-200 bg-gray-50 focus:outline-none focus:ring focus:border-blue-300 w-full`}
              onChange={(event) => setInputText(event.target.value)}
              type="url"
              placeholder={placeholderText}
            />
          </div>
          <div
            className={tw`my-4 bg-gray-50 border-2 border-dashed border-gray-200 py-4 text-sm text-gray-400`}
          >
            Choose a File. <br /> (Or Drop it Here)
          </div>
          <div className={tw`mt-4`}>
            <button
              className={tw`bg-blue-400 rounded-sm hover:bg-blue-500 focus:bg-blue-600 py-1 text-white w-full flex items-center justify-center`}
              type="submit"
            >
              {loading && (
                <svg
                  className={tw`animate-spin h-4 text-white mr-2`}
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className={tw`opacity-25`}
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  ></circle>
                  <path
                    className={tw`opacity-75`}
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
              )}
              {buttonText}
            </button>
          </div>
          <div className={tw`text-sm text-gray-400 mt-4`}>{bottomText}</div>
        </form>
      </div>
    </>
  );
};
