import { Tooltip } from "@mui/material";
import { unparse } from "papaparse";
import type { FunctionComponent } from "react";
import { useCallback } from "react";

import { TableHeaderButton } from "./table-header-button";

type CsvFile = {
  title: string;
  content: string[][];
};

export type GenerateCsvFileFunction = () => CsvFile | null;

export const ExportToCsvButton: FunctionComponent<{
  generateCsvFile: GenerateCsvFileFunction;
}> = ({ generateCsvFile }) => {
  const handleExportToCsv = useCallback(() => {
    const generatedCsvFile = generateCsvFile();

    if (!generatedCsvFile) {
      return;
    }

    const { title, content } = generatedCsvFile;

    const stringifiedContent = unparse(content);

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
    <Tooltip title="Export the visible rows to CSV" placement="top">
      <TableHeaderButton onClick={handleExportToCsv}>Export</TableHeaderButton>
    </Tooltip>
  );
};
