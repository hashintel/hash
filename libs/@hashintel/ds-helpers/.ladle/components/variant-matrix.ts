export function variantMatrix<T extends object>({
  cols,
  rows,
}: Readonly<{
  cols?: Partial<T>[];
  rows?: Partial<T>[];
}>) {
  cols ??= [{}];
  rows ??= [{}];
  return rows.flatMap((r) => cols.map((c) => ({ ...c, ...r }) as T));
}
