export const isTopWindow = () => {
  try {
    return window.top === window.self;
  } catch {
    return false;
  }
};

export type CustomElementDefinition = {
  elementClass: typeof HTMLElement;
  tagName: string;
};
