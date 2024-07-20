export const isTopWindow = () => {
  try {
    return window.top === window.self;
  } catch {
    return false;
  }
};

export interface CustomElementDefinition {
  elementClass: typeof HTMLElement;
  tagName: string;
}
