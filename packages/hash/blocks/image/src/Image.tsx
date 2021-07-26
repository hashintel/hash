import React, { useEffect, useState, VoidFunctionComponent } from "react";

import { tw } from "twind";
import { BlockProtocolProps } from "./types/blockProtocol";

type AppProps = {
  width?: number;
  height?: number;
  maxHeight?: number;
  maxWidth?: number;
  initialSrc?: string;
  initialCaption?: string;
  uploadImage: ({ file, imgURL }: { file?: File; imgURL?: string }) => Promise<{
    src?: string;
    error?: string;
  }>;
  entityId: string;
  entityType?: string;
};

function uuidv4() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
    var r = (Math.random() * 16) | 0,
      v = c == "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export const Image: VoidFunctionComponent<AppProps & BlockProtocolProps> = (
  props
) => {
  const {
    initialSrc,
    initialCaption,
    uploadImage,
    entityId,
    entityType,
    update,
    width,
    height,
    maxHeight,
    maxWidth,
  } = props;

  const [src, setSrc] = useState(initialSrc ?? "");

  console.log({ props, src });

  const [inputText, setInputText] = useState("");
  const [captionText, setCaptionText] = useState(initialCaption ?? "");
  const [loading, setLoading] = useState(false);
  const [displayAlert, setDisplayAlert] = useState(false);
  const [errorString, setErrorString] = useState("");

  const [randomId, setRandomId] = useState("");

  useEffect(() => {
    setRandomId(`image-input-${uuidv4()}`);
  }, []);

  const copyObject = {
    placeholderText: "Enter Image URL",
    buttonText: "Embed Image",
    bottomText: "Works with web-supported image formats",
  };

  const { bottomText, buttonText, placeholderText } = copyObject;

  function displayError(errorString: string) {
    setErrorString(errorString);
    setDisplayAlert(true);
  }

  function updateData(src: string | undefined) {
    if (src?.trim()) {
      if (update) {
        const updateAction: {
          data: {
            initialSrc: string;
          };
          entityId?: string;
          entityType?: string;
        } = {
          data: { initialSrc: src },
          entityId,
        };

        if (entityType) {
          updateAction.entityType = entityType;
        }

        console.log({ updateAction });

        update([updateAction]);
      }

      setSrc(src);
    }
  }

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (loading) {
      return;
    }

    if (inputText?.trim()) {
      setLoading(true);
      uploadImage({ imgURL: inputText }).then(({ src, error }) => {
        setLoading(false);

        if (error?.trim()) {
          return displayError(error);
        }

        updateData(src);
      });
    } else {
      displayError("Please enter a valid image URL or select a file below");
    }
  };

  const onFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { files } = e.target;

    if (files?.[0]) {
      uploadImage({ file: files[0] }).then(({ src, error }) => {
        if (error?.trim()) {
          return displayError(error);
        }

        updateData(src);
      });
    }
  };

  const resetComponent = () => {
    setDisplayAlert(false);
    setInputText("");
    setCaptionText("");
    setSrc("");
  };

  if (src?.trim()) {
    return (
      <div className={tw`flex justify-center text-center w-full`}>
        <div className={tw`flex flex-col`}>
          <img
            {...props}
            style={{
              width: width ?? undefined,
              height: height ?? undefined,
              maxWidth: maxWidth ?? undefined,
              maxHeight: maxHeight ?? undefined,
            }}
            src={src}
            alt="Image block"
          />

          <input
            placeholder="Add a caption"
            className={tw`focus:outline-none text-center mt-3`}
            type="text"
            value={captionText}
            onChange={(e) => setCaptionText(e.target.value)}
            onBlur={() => {
              if (update) {
                const updateAction: {
                  data: {
                    initialSrc: string;
                    initialCaption: string;
                  };
                  entityId?: string;
                  entityType?: string;
                } = {
                  data: { initialSrc: src, initialCaption: captionText },
                  entityId,
                };

                if (entityType) {
                  updateAction.entityType = entityType;
                }

                console.log({ updateAction });

                update([updateAction]);
              }
            }}
          />
        </div>
        <button
          // Tailwind doesn't have this as a class
          // https://github.com/tailwindlabs/tailwindcss/issues/1042#issuecomment-781271382
          style={{ height: "max-content" }}
          onClick={() => {
            resetComponent();
          }}
          className={tw`ml-2 bg-gray-100 p-1.5 border-1 border-gray-300 rounded-sm`}
        >
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              fillRule="evenodd"
              clipRule="evenodd"
              d="M18.5302 7.22194C18.8234 7.51444 18.8234 7.98919 18.5302 8.28244L17.1562 9.65644L14.3437 6.84394L15.7177 5.46994C16.0109 5.17669 16.4857 5.17669 16.7782 5.46994L18.5302 7.22194ZM5.24991 18.7502V15.9377L13.5487 7.63894L16.3612 10.4514L8.06241 18.7502H5.24991Z"
              fill="rgba(107, 114, 128)"
            />
          </svg>
        </button>
      </div>
    );
  }

  return (
    <>
      {displayAlert && (
        <div
          className={tw`max-w-md mx-auto mb-4 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative`}
          role="alert"
        >
          <strong className={tw`font-bold`}>Error</strong>
          <span className={tw`block sm:inline ml-2 mr-2`}>{errorString}</span>
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
        onDragOver={(e) => {
          e.stopPropagation();
          e.preventDefault();
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();

          var dT = e.dataTransfer;
          var files = dT.files;

          if (files && files.length) {
            // we set our input's 'files' property

            if (files[0].type.search("image") > -1) {
              uploadImage({ file: files[0] }).then(({ src, error }) => {
                if (error?.trim()) {
                  return displayError(error);
                }

                updateData(src);
              });
            }
          }
        }}
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
          <div>
            <label htmlFor={randomId}>
              <div
                className={tw`my-4 bg-gray-50 border-2 border-dashed border-gray-200 py-4 text-sm text-gray-400 cursor-pointer`}
              >
                Choose a File. <br /> (or Drop it Here)
              </div>
            </label>

            <input
              id={randomId}
              className={tw`hidden`}
              type="file"
              accept="image/*"
              onChange={onFileSelect}
            />
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
