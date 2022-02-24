import React, { VFC } from "react";
import { tw } from "twind";
import Loader from "../svgs/Loader";

type UploadImageFormProps = {
  onFileChoose: (file: File) => void;
  onUrlChange: (url: string) => void;
  onUrlConfirm: () => void;
  loading: boolean;
  src: string;
  width: number | undefined;
};

export const UploadImageForm: VFC<UploadImageFormProps> = (props) => {
  /**
   * @todo This should throw some kind of error if an invalid image is passed
   */
  const onFilesChoose = (files: FileList | null) => {
    if (files?.[0] && files[0].type.search("image") > -1) {
      props.onFileChoose(files[0]);
    }
  };

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

          props.onUrlConfirm();
        }}
      >
        <div>
          {/** @todo need to make this controlled */}
          <input
            className={tw`px-1.5 py-1 rounded-sm border-2 border-gray-200 bg-gray-50 focus:outline-none focus:ring focus:border-blue-300 w-full`}
            onChange={(event) => props.onUrlChange(event.target.value)}
            type="url"
            placeholder="Enter Image URL"
          />
        </div>
        <div>
          <label>
            <div
              className={tw`my-4 bg-gray-50 border-2 border-dashed border-gray-200 py-4 text-sm text-gray-400 cursor-pointer`}
            >
              Choose a File. <br /> (or Drop it Here)
            </div>

            <input
              className={tw`hidden`}
              type="file"
              accept="image/*"
              onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                onFilesChoose(event.target.files)
              }
            />
          </label>
        </div>
        <div className={tw`mt-4`}>
          <button
            className={tw`bg-blue-400 rounded-sm hover:bg-blue-500 focus:bg-blue-600 py-1 text-white w-full flex items-center justify-center`}
            type="submit"
          >
            {props.loading && <Loader />}
            Embed Image
          </button>
        </div>
        <div className={tw`text-sm text-gray-400 mt-4`}>
          Works with web-supported image formats
        </div>
      </form>
    </div>
  );
};
