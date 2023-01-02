export interface CellInputProps<T extends unknown> {
  onChange: (value: T) => void;
  value: T;
}
