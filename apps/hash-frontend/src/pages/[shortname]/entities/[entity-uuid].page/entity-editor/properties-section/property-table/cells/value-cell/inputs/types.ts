export interface CellInputProps<T extends unknown> {
  /** `isDiscarded` can set as `true` to indicate value is not changed (check `JsonInput` for example) */
  onChange: (value: T, isDiscarded?: boolean) => void;
  value: T;
}
