import * as Bowser from "bowser";

const browser = Bowser.getParser(window.navigator.userAgent);

export const browserName = browser.getBrowserName();
