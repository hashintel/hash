
export type BlockProps = object;

type BlockVariant = {
  description?: string;
  icon?: string;
  name?: string;
  properties?: BlockProps;
};

/**
 * @todo type all as unknown and check properly
 * we can't rely on people defining the JSON correctly
 */
export type BlockMetadata = {
  author?: string;
  description?: string;
  externals?: Record<string, string>;
  license?: string;
  name?: string;
  schema?: string;
  source?: string;
  variants?: BlockVariant[];
  version?: string;
};
