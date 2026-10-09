/**
 * Use to check if current browser is Safari or not
 */
export const isSafariBrowser = () =>
  navigator.userAgent.indexOf("Safari") > -1 &&
  navigator.userAgent.indexOf("Chrome") <= -1;
