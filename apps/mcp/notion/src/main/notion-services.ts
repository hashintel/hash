import type { Client } from "@notionhq/client";
import { NotionToMarkdown } from "notion-to-md";

type PageSearchResult = {
  id: string;
  title: string;
  url: string;
  createdAt: string;
  lastEditedAt: string;
};

export const searchPageByTitle = async (
  notionClient: Client,
  query: string,
): Promise<PageSearchResult[]> => {
  const response = await notionClient.search({
    query,
  });

  return response.results.map((page) => {
    let title = "Untitled";

    if ("properties" in page) {
      const titleProperty = page.properties.title;
      if (titleProperty && titleProperty.type === "title") {
        title = titleProperty.title.map((part) => part.plain_text).join("");
      }
    }

    let icon = null;
    if ("icon" in page && page.icon) {
      if (page.icon.type === "emoji") {
        icon = page.icon.emoji;
      } else if (page.icon.type === "external" && "url" in page.icon) {
        icon = page.icon.url;
      } else if (page.icon.type === "file" && "url" in page.icon) {
        icon = page.icon.url;
      }
    }

    return {
      id: page.id,
      title,
      url: "url" in page ? page.url : "",
      icon,
      createdAt: "created_time" in page ? page.created_time : "",
      lastEditedAt: "last_edited_time" in page ? page.last_edited_time : "",
    };
  });
};

export const getPageContent = async (
  notionClient: Client,
  pageId: string,
): Promise<string> => {
  const n2m = new NotionToMarkdown({
    notionClient,
    config: { separateChildPage: false, parseChildPages: false },
  });

  const blocks = await n2m.pageToMarkdown(pageId);

  const markdown = n2m.toMarkdownString(blocks);

  return markdown.parent ?? "";
};
