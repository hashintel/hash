import { FunctionComponent, useCallback } from "react";

import { TableHeaderButton } from "./table-header-button";

type CsvFile = {
  title: string;
  content: string[][];
};

export type GenerateCsvFileFunction = () => Promise<CsvFile | null>;

export const ExportToCsvButton: FunctionComponent<{
  generateCsvFile: GenerateCsvFileFunction;
}> = ({ generateCsvFile }) => {
  const handleExportToCsv = useCallback(async () => {
    const generatedCsvFile = await generateCsvFile();

    if (!generatedCsvFile) {
      return;
    }

    const { title, content } = generatedCsvFile;

    const stringifiedContent = content.map((row) => row.join(",")).join("\n");

    // Create a blob with the CSV content
    const blob = new Blob([stringifiedContent], {
      type: "text/csv;charset=utf-8;",
    });

    // Create a temporary anchor element to trigger the download
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.setAttribute("download", `${title}.csv`);
    document.body.appendChild(link);

    // Trigger the download
    link.click();

    // Clean up the temporary anchor element
    document.body.removeChild(link);
  }, [generateCsvFile]);

  return (
    <TableHeaderButton onClick={handleExportToCsv}>
      Export to CSV
    </TableHeaderButton>
  );
};
