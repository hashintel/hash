import { Feed } from "feed";
import { writeFile } from "fs-extra";

import {
  FRONTEND_URL,
  SITE_FAVICON_PATH,
  SITE_SOCIAL_COVER_IMAGE_URL,
} from "../../../config";
import { parseNameFromFileName } from "../../../util/client-mdx-util";
import type { Page } from "../../../util/mdx-util";
import type { BlogPost } from "../[...blog-slug].page";
import { blogAtomPath, blogRssPath } from "./feed-paths";

export const generateFeeds = async (posts: Page<BlogPost>[]) => {
  const feed = new Feed({
    title: "HASH Developer Blog",
    description:
      "Blog posts for people who want to follow progress on or help build the future of decision-making with HASH",
    id: "https://hash.dev/blog",
    link: "https://hash.dev/blog",
    language: "en-us",
    image: SITE_SOCIAL_COVER_IMAGE_URL,
    favicon: `${FRONTEND_URL}${SITE_FAVICON_PATH}`,
    copyright: `Copyright ${new Date().getFullYear()}, HASH`,
    feedLinks: {
      rss: `${FRONTEND_URL}${blogRssPath}`,
      atom: `${FRONTEND_URL}${blogAtomPath}`,
    },
  });

  for (const post of posts) {
    const url = `${FRONTEND_URL}/blog/${parseNameFromFileName(post.fileName)}`;

    feed.addItem({
      title: post.data.title,
      id: url,
      link: url,
      description: post.data.subtitle,
      category: post.data.categories?.map((category) => ({
        name: category,
        term: category,
      })),
      author: post.data.authors.map((author) => ({
        name: author.name,
      })),
      date: new Date(post.data.date),
      image: `${FRONTEND_URL}/${post.data.postPhoto}`,
    });
  }

  await Promise.all([
    writeFile(`./public/${blogRssPath}`, feed.rss2()),
    writeFile(`./public/${blogAtomPath}`, feed.atom1()),
  ]);

  return feed;
};
