// This doesn't actually upload the image, just supplies a fake link to the local file or internet URL
export const uploadImage = async ({
  file,
  imgURL,
}: {
  file?: File;
  imgURL?: string;
}): Promise<{
  src?: string;
}> => {
  if (imgURL?.trim()) {
    return { src: imgURL };
  }

  if (!file) {
    throw new Error("Please enter a valid image URL or select a file below");
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
