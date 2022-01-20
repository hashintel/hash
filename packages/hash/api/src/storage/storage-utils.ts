const FILE_EXTENSION_REGEX = /\.[0-9a-z]+$/i;

export function getFileExtension(fileName: string) {
  return fileName.match(FILE_EXTENSION_REGEX);
}
