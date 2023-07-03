type RootProperties = {
  process_resources?: { [key: string]: number };
  process_name?: string;
};

type SourceParameters = {
  add_id?: boolean;
  code_template?: string;
  template: any;
  rate?: number;
  frequency?: number;
  next_block: string;
};

type SinkParameters = {
  record_count?: boolean;
  record_through_time?: boolean;
  record_wait_times?: boolean;
};

type DelayParameters = {
  code_time?: string;
  time?: number;
  uniform_time?: [number, number];
  triangular_time?: [number, number, number];
  next_block: string;
};

type SeizeParameters = {
  resource: string;
  track_wait?: boolean;
  next_block: string;
};

type ReleaseParameters = {
  resource: string;
  next_block: string;
};

type EnterParameters = {
  next_block: string;
};

type ExitParameters = {
  to?: string;
  to_field?: string;
  to_code?: string;
  next_block?: string;
};

type ServiceParameters = {
  time: boolean;
  resource: string;
  track_wait?: boolean;
  next_block: string;
};

type SelectOutputParameters = {
  code_condition?: string;
  condition_field?: string;
  true_chance?: number;
  true_block?: string;
  false_block: string;
  remove_condition_field?: boolean;
};

type CustomParameters = {
  behavior: string;
};

export type ProcessParameters =
  | RootProperties
  | CustomParameters
  | SourceParameters
  | SinkParameters
  | SeizeParameters
  | ReleaseParameters
  | EnterParameters
  | ExitParameters
  | ServiceParameters
  | DelayParameters
  | SelectOutputParameters;

type KeysOfUnion<T> = T extends T ? keyof T : never;
export type ParameterName = KeysOfUnion<ProcessParameters> | "name";
