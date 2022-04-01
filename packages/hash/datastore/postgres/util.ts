export const stripNewLines = (inputString: string) =>
  inputString.replace(/(\r\n|\n|\r)( *)/gm, " ");
