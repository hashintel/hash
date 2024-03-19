import type { ChangeEvent, FunctionComponent } from "react";
import { tw } from "twind";

import Loader from "../svgs/loader";

type UploadMediaFormProps = {
  onFileChoose: (file: File) => void;
  onUrlChange: (url: string) => void;
  onUrlConfirm: () => void;
  loading: boolean;
  type: "image" | "video";
  readonly?: boolean;
};

export const UploadMediaForm: FunctionComponent<UploadMediaFormProps> = ({
  loading,
  onFileChoose,
  onUrlChange,
  onUrlConfirm,
  type,
  readonly,
}) => {
  /**
   * @todo This should throw some kind of error if an invalid media is passed
   */
  const onFilesChoose = (files: FileList | null) => {
    if (files?.[0] && files[0].type.search(type) > -1) {
      onFileChoose(files[0]);
    }
  };

  const capitalisedType = type === "image" ? "Image" : "Video";

  return (
    <div
      className={tw`w-96 mx-auto bg-white rounded-sm shadow-md overflow-hidden text-center p-4 border-2 border-gray-200`}
      onDragOver={(event) => {
        event.stopPropagation();
        event.preventDefault();
      }}
      onDrop={(event) => {
        event.preventDefault();
        event.stopPropagation();

        onFilesChoose(event.dataTransfer.files);
      }}
    >
      <form
        className={tw`mb-0`}
        onSubmit={(event) => {
          event.preventDefault();

          onUrlConfirm();
        }}
      >
        <div>
          {/** @todo need to make this controlled */}
          <input
            className={tw`box-border text-base border-solid px-1.5 py-1 rounded-sm border-2 border-gray-200 bg-gray-50 focus:outline-none focus:ring focus:border-blue-300 w-full`}
            onChange={(event) => onUrlChange(event.target.value)}
            type="url"
            placeholder={`Enter ${capitalisedType} URL`}
            disabled={readonly}
          />
        </div>
        <div>
          <label>
            <div
              className={tw`text-base my-4 bg-gray-50 border-2 border-dashed border-gray-200 py-4 text-sm text-gray-400 ${
                !readonly ? "cursor-pointer" : ""
              }`}
            >
              Choose a File. <br /> (or Drop it Here)
            </div>

            <input
              className={tw`hidden`}
              disabled={readonly}
              type="file"
              accept={`${type}/*`}
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                onFilesChoose(event.target.files)
              }
            />
          </label>
        </div>
        <div className={tw`mt-4`}>
          {!readonly && (
            <button
              className={tw`text-base border-none bg-blue-400 rounded-sm hover:bg-blue-500 focus:bg-blue-600 py-1 text-white w-full flex items-center justify-center`}
              type="submit"
            >
              {loading && <Loader />}
              Insert {capitalisedType}
            </button>
          )}
        </div>
        <div className={tw`text-sm text-gray-400 mt-4`}>
          Works with web-supported {type} formats
        </div>
      </form>
    </div>
  );
};
