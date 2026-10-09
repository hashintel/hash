import { useRef, useState } from "react";

export const FLASHING_ROW_MS = 3_000;

export const useFlashRow = () => {
  const [flashingRows, setFlashingRows] = useState<string[]>([]);
  const flashingTimeouts = useRef<
    Record<string, ReturnType<typeof setTimeout>>
  >({});

  const flashRow = (row: string) => {
    setFlashingRows([...flashingRows, row]);

    clearTimeout(flashingTimeouts.current[row]);

    flashingTimeouts.current[row] = setTimeout(() => {
      setFlashingRows((current) => current.filter((id) => id !== row));
    }, FLASHING_ROW_MS);
  };

  return [flashingRows, flashRow] as const;
};
