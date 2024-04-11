import OpenAI from "openai";

if (!process.env.OPENAI_API_KEY) {
  throw new Error("OPENAI_API_KEY environment variable not set.");
}

export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});
