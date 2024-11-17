import { GoogleGenerativeAI } from "@google/generative-ai";
import { GoogleAIFileManager } from "@google/generative-ai/server";
import z from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

let _googleGenAi: GoogleGenerativeAI | undefined;
let _fileManager: GoogleAIFileManager | undefined;

const academicPaperMetadata = z.object({
  doi: z.string().optional(),
  doiLink: z.string().optional(),
  publishedIn: z
    .object({
      description: z.string().optional(),
      title: z.string(),
    })
    .optional(),
  type: z.literal("AcademicPaper"),
});

export type AcademicPaperMetadata = {
  doi?: string;
  doiLink?: string;
  publishedIn?: {
    description?: string;
    title: string;
  };
  type: "AcademicPaper";
};

export type BookMetadata = {
  isbn?: number;
  publishedBy?: {
    description?: string;
    name: string;
  };
};

export type DocumentBaseMetadata = {
  authors: { name: string; description?: string }[];
  publishedInYear?: number;
  summary: string;
  title: string;
};

export type DocumentMetadata = DocumentBaseMetadata &
  (AcademicPaperMetadata | BookMetadata);

const getGoogleGenerativeAI = () => {
  const apiKey = process.env.GOOGLE_VERTEX_AI_API_KEY;

  if (!apiKey) {
    throw new Error("GOOGLE_VERTEX_AI_API_KEY is not set");
  }

  if (!_googleGenAi) {
    _googleGenAi = new GoogleGenerativeAI(apiKey);
  }
  if (!_fileManager) {
    _fileManager = new GoogleAIFileManager(apiKey);
  }
  return { googleGenAi: _googleGenAi, fileManager: _fileManager };
};

export const getLlmAnalysisOfDoc = async (
  documentFilePath: string,
): Promise<DocumentMetadata> => {
  const { googleGenAi, fileManager } = getGoogleGenerativeAI();

  const model = googleGenAi.getGenerativeModel({
    model: "gemini-1.5-flash",
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: zodToJsonSchema(academicPaperMetadata),
    },
  });

  // Upload the file and specify a display name.
  const uploadResponse = await fileManager.uploadFile("media/gemini.pdf", {
    mimeType: "application/pdf",
    displayName: "Gemini 1.5 PDF",
  });

  console.log(
    `Uploaded file ${uploadResponse.file.displayName} as: ${uploadResponse.file.uri}`,
  );

  const result = await model.generateContent([
    {
      fileData: {
        mimeType: uploadResponse.file.mimeType,
        fileUri: uploadResponse.file.uri,
      },
    },
    { text: "Can you summarize this document as a bulleted list?" },
  ]);

  console.log(result.response.text());
};
