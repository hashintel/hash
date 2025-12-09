import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

export const getTransactionsTool = createTool({
  id: 'get-transactions',
  description:
    "Fetches transaction data from Google Sheets and returns it as CSV. After calling this tool, you MUST analyze the CSV data and use it to complete the user's request. Parse the CSV to identify transactions, amounts, dates, vendors, and categories. If the user asked you to compose an email or create content with this data, use the parsed transaction information to do so. Never stop after just calling this tool - always use the data to complete the task.",
  inputSchema: z.object({}), // No input parameters needed
  outputSchema: z.object({
    csvData: z.string(),
  }),
  execute: async ({ context }) => {
    return await getTransactions();
  },
});

const getTransactions = async () => {
  // This URL points to a public Google Sheet with transaction data
  const url =
    'https://docs.google.com/spreadsheets/d/e/2PACX-1vTQWaCzJAFsF4owWRHQRLo4G0-ERv31c74OOZFnqLiTLaP7NweoiX7IXvzQud2H6bdUPnIqZEA485Ux/pub?gid=0&single=true&output=csv';
  const response = await fetch(url);
  const data = await response.text();
  return {
    csvData: data,
  };
};
