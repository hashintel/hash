export const convertTitleToCamelCase = (title: string) =>
  title
    // remove all non-alphanumeric, non-space characters
    .replace(/[^a-zA-Z0-9\s]/g, "")
    .split(" ")
    .map((word, index) =>
      // If it's the first word, convert it to lowercase
      // Otherwise, capitalize the first letter and then add the rest of the word in lowercase
      index === 0
        ? word.toLowerCase()
        : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase(),
    )
    // Join all the processed words to get the camelCase result
    .join("");
