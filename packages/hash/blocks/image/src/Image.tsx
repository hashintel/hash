import React, { useCallback, useEffect, useRef, useState } from "react";
import { unstable_batchedUpdates } from "react-dom";

import { v4 as uuid } from "uuid";
import { tw } from "twind";
import { BlockComponent } from "@hashintel/block-protocol/react";
import { BlockProtocolUpdatePayload } from "@hashintel/block-protocol";

import { ResizeImageBlock } from "./components/ResizeImageBlock";

import Loader from "./svgs/Loader";
import Pencil from "./svgs/Pencil";
import Cross from "./svgs/Cross";

type UploadFileParamsType = {
  file?: File;
  url?: string;
  mime?: string;
};

type AppProps = {
  initialSrc?: string;
  initialCaption?: string;
<<<<<<< HEAD
  uploadFile: (uploadFileParams: UploadFileParamsType) => Promise<{
=======
  initialWidth?: number;
  uploadImage: (uploadImageParams: UploadImageParamsType) => Promise<{
>>>>>>> origin/main
    src?: string;
  }>;
  entityId: string;
  entityTypeId?: string;
};

const placeholderText = "Enter Image URL";
const buttonText = "Embed Image";
const bottomText = "Works with web-supported image formats";

const IMG_MIME_TYPE = "image/*";

export const Image: BlockComponent<AppProps> = (props) => {
  const {
    initialSrc,
    initialCaption,
<<<<<<< HEAD
    uploadFile,
=======
    initialWidth,
    uploadImage,
>>>>>>> origin/main
    entityId,
    entityTypeId,
    update,
  } = props;

  const [stateObject, setStateObject] = useState<{
    src: string;
    loading: boolean;
    width: number | undefined;
    errorString: string | null;
  }>({
    src: initialSrc ?? "",
    width: initialWidth,
    loading: false,
    errorString: null,
  });
  const [inputText, setInputText] = useState("");
  const [captionText, setCaptionText] = useState(initialCaption ?? "");
  const [randomId] = useState(() => `image-input-${uuid()}`);

  const isMounted = useRef(false);

  useEffect(() => {
    isMounted.current = true;

    return () => {
      isMounted.current = false;
    };
  }, []);

  const updateStateObject = useCallback(
    (properties: Partial<typeof stateObject>) => {
      setStateObject((stateObject) => ({ ...stateObject, ...properties }));
    },
    []
  );

  const updateData = useCallback(
    (src: string | undefined, width?: number) => {
      if (src?.trim()) {
        if (update) {
          const updateAction: BlockProtocolUpdatePayload<
            Pick<AppProps, "initialSrc" | "initialCaption" | "initialWidth">
          > = {
            data: {
              initialSrc: src,
              initialCaption: captionText,
            },
            entityId,
          };

          if (width) {
            updateAction.data.initialWidth = width;
          }

          if (entityTypeId) {
            updateAction.entityTypeId = entityTypeId;
          }

          void update([updateAction]);
        }

        updateStateObject(width ? { src, width } : { src });
      }
    },
    [captionText, entityId, entityTypeId, updateStateObject, update]
  );

  const updateWidth = useCallback(
    (width: number) => {
      updateData(stateObject.src, width);
    },
    [stateObject.src, updateData]
  );

  const displayError = (errorString: string) => {
    updateStateObject({ errorString });
  };

  const handleImageUpload = useCallback(
    (imageProp: { imgURL: string } | { file: FileList[number] }) => {
      updateStateObject({ loading: true });
      uploadImage(imageProp)
        .then(({ src }: { src?: string }) => {
          if (isMounted.current) {
            updateStateObject({ loading: false });
            updateData(src);
          }
        })
        .catch((error: Error) =>
          updateStateObject({
            errorString: error.message,
            loading: false,
          })
        );
    },
    [updateData, updateStateObject, uploadImage]
  );

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const { loading } = stateObject;

    if (loading) {
      return;
    }

    if (inputText?.trim()) {
<<<<<<< HEAD
      setStateObject((stateObject) => ({ ...stateObject, loading: true }));

      void uploadFile({ url: inputText, mime: IMG_MIME_TYPE })
        .then(({ src }) => {
          if (isMounted.current) {
            setStateObject((stateObject) => ({
              ...stateObject,
              loading: false,
            }));

            updateData(src);
          }
        })
        .catch((error) => {
          return displayError(error);
        });
=======
      handleImageUpload({ imgURL: inputText });
>>>>>>> origin/main
    } else {
      displayError("Please enter a valid image URL or select a file below");
    }
  };

  const onFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const { files } = event.target;

    if (files?.[0]) {
<<<<<<< HEAD
      void uploadFile({ file: files[0], mime: IMG_MIME_TYPE }).then(({ src, error }) => {
        if (isMounted.current) {
          if (error?.trim()) {
            return displayError(error);
          }

          updateData(src);
        }
      });
=======
      handleImageUpload({ file: files[0] });
>>>>>>> origin/main
    }
  };

  const resetComponent = () => {
    unstable_batchedUpdates(() => {
      setStateObject({
        loading: false,
        errorString: null,
        src: "",
        width: undefined,
      });

      setInputText("");
      setCaptionText("");
    });
  };

  if (stateObject.src?.trim()) {
    return (
      <div className={tw`flex justify-center text-center w-full`}>
        <div className={tw`flex flex-col`}>
          <ResizeImageBlock
            imageSrc={stateObject.src}
            width={stateObject.width}
            updateWidth={updateWidth}
          />
          <input
            placeholder="Add a caption"
            className={tw`focus:outline-none text-center mt-3`}
            type="text"
            value={captionText}
            onChange={(event) => setCaptionText(event.target.value)}
            onBlur={() => updateData(stateObject.src)}
          />
        </div>
        <button
          onClick={() => {
            resetComponent();
          }}
          className={tw`ml-2 bg-gray-100 p-1.5 border-1 border-gray-300 rounded-sm self-start`}
        >
          <Pencil />
        </button>
      </div>
    );
  }

  return (
    <>
      {stateObject.errorString && (
        <div
          className={tw`w-96 mx-auto mb-4 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative`}
          role="alert"
        >
          <div className={tw`mr-5`}>
            <strong className={tw`font-bold`}>Error</strong>
            <span className={tw`block sm:inline ml-2 `}>
              {stateObject.errorString}
            </span>
          </div>
          <span
            onClick={() => updateStateObject({ errorString: null })}
            className={tw`absolute top-0 bottom-0 right-0 px-4 py-3`}
          >
            <Cross />
          </span>
        </div>
      )}

      <div
        className={tw`w-96 mx-auto bg-white rounded-sm shadow-md overflow-hidden text-center p-4 border-2 border-gray-200`}
        onDragOver={(event) => {
          event.stopPropagation();
          event.preventDefault();
        }}
        onDrop={(event) => {
          event.preventDefault();
          event.stopPropagation();

          const dT = event.dataTransfer;
          const files = dT.files;

          if (files && files.length) {
            // we set our input's 'files' property

            if (files[0].type.search("image") > -1) {
<<<<<<< HEAD
              void uploadFile({ file: files[0], mime: IMG_MIME_TYPE }).then(({ src, error }) => {
                if (isMounted.current) {
                  if (error?.trim()) {
                    return displayError(error);
                  }

                  updateData(src);
                }
              });
=======
              handleImageUpload({ file: files[0] });
>>>>>>> origin/main
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
              accept={IMG_MIME_TYPE}
              onChange={onFileSelect}
            />
          </div>
          <div className={tw`mt-4`}>
            <button
              className={tw`bg-blue-400 rounded-sm hover:bg-blue-500 focus:bg-blue-600 py-1 text-white w-full flex items-center justify-center`}
              type="submit"
            >
              {stateObject.loading && <Loader />}
              {buttonText}
            </button>
          </div>
          <div className={tw`text-sm text-gray-400 mt-4`}>{bottomText}</div>
        </form>
      </div>
    </>
  );
};
