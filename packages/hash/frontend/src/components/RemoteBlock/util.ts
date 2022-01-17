export const isTopWindow = () => {
  try {
    return window.top === window.self;
  } catch {
    return false;
  }
};
