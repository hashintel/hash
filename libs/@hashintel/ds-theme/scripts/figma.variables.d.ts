export type Collection = {
  readonly id: string;
  readonly name: string;
  readonly hiddenFromPublishing: boolean;
  readonly key: string;
  readonly modes: ReadonlyArray<{
    id: string;
    name: string;
  }>;
  readonly variableIds: ReadonlyArray<string>;
  readonly defaultModeId: string;
};

/**
 * NON-exhaustive list of variable scopes from Figma export.
 * See: https://help.figma.com/hc/en-us/articles/15145852043927-Create-and-manage-variables-and-collections#h_01H32HZB74TE7MJXYBWEBBQWJV
 */
export type VariableScope =
  | "ALL_SCOPES"
  | "WIDTH_HEIGHT"
  | "GAP"
  | "COLOR"
  | "FILL_COLOR"
  | "STROKE_COLOR"
  | "NUMBER"
  | "BOOLEAN"
  | "STRING"
  | "TEXT_FILL"
  | "SHAPE_FILL"
  | "FONT_SIZE"
  | "FONT_STYLE"
  | "LINE_HEIGHT"
  | "CORNER_RADIUS"
  | "FRAME_FILL";

/**
 * Exhaustive list of variable types from Figma export.
 * See: https://help.figma.com/hc/en-us/articles/14506821864087-Overview-of-variables-collections-and-modes
 */
export type VariableType = "COLOR" | "FLOAT" | "STRING" | "BOOLEAN";

/**
 * NON-exhaustive list of variable value types from Figma export.
 * See: https://help.figma.com/hc/en-us/articles/14506821864087-Overview-of-variables-collections-and-modes
 */
export type VariableValue =
  | string
  | number
  | VariableValueColor
  | VariableValueAlias;

export type VariableValueColor = {
  readonly r: number;
  readonly g: number;
  readonly b: number;
};

export type VariableValueAlias = {
  readonly type: "VARIABLE_ALIAS";
  readonly id: string;
};

export type Variable = {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly key: string;
  readonly remote: boolean;
  readonly scopes: ReadonlyArray<VariableScope>;
  readonly type: VariableType;
  readonly valuesByMode: {
    readonly [modeId: string]: VariableValue;
  };
};

export type FigmaVariablesExport = {
  readonly collections: ReadonlyArray<Collection>;
  readonly variables: ReadonlyArray<Variable>;
};
