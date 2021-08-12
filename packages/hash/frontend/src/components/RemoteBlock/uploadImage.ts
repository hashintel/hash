// This doesn't actually upload the image, just supplies a fake link to the local file or internet URL
export const uploadImage = async ({
  file,
  imgURL,
}: {
  file?: File;
  imgURL?: string;
}): Promise<{
  src?: string;
  error?: string;
}> => {
  if (imgURL?.trim()) {
    return { src: imgURL };
  }

  if (file) {
    return new Promise((resolve) => {
      const reader = new FileReader();

      reader.onload = (event) => {
        if (event.target?.result) {
          resolve({ src: event.target.result.toString() });
        } else {
          resolve({ error: "Couldn't read your file" });
        }
      };

      reader.readAsDataURL(file);
    });
  }

  return {
    error: "Please enter a valid image URL or select a file below",
  };
};
