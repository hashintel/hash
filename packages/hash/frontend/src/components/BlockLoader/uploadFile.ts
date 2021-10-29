/**
 * This doesn't actually upload the file, just supplies a fake link to the local file or internet URL
 * @todo make this a hook when implementing a real uploadFile function
 */

export const uploadFile = async ({
  file,
  url,
  mime,
}: {
  file?: File;
  url?: string;
  mime?: string;
}): Promise<{
  src?: string;
}> => {
  if (url?.trim()) {
    return { src: url };
  }

  if (!file) {
    let fileType = "";

    if (mime) {
      if (mime.includes("image")) {
        fileType = "Image";
      }

      if (mime.includes("video")) {
        fileType = "Video";
      }
    }

    throw new Error(
      `Please enter a valid  ${
        fileType ? `${fileType} ` : ""
      }URL or select a file below`
    );
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (event) => {
      if (event.target?.result) {
        resolve({ src: event.target.result.toString() });
      } else {
        reject(new Error("Couldn't read your file"));
      }
    };

    reader.readAsDataURL(file);
  });
};
