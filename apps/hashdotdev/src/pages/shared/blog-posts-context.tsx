import { createContext, useContext } from "react";

import type { BlogPostPagePhoto } from "../../components/blog-post";
import type { Page } from "../../util/mdx-util";
import type { BlogPost } from "../blog/[...blog-slug].page";

export type BlogIndividualPage = Page<BlogPost> & {
  photos: {
    post?: BlogPostPagePhoto | null;
    postSquare?: BlogPostPagePhoto | null;
  };
};

type BlogPostsState = {
  posts: BlogIndividualPage[];
};

export const BlogPostsContext = createContext<BlogPostsState | undefined>(
  undefined,
);

export const BlogPostsProvider = BlogPostsContext.Provider;

export const useBlogPosts = (): BlogPostsState => {
  const blogPostsState = useContext(BlogPostsContext);

  if (!blogPostsState) {
    throw new Error(
      "Cannot use blog posts because its state has not been defined. Verify `useBlogPosts` is being called within a child of the `BlogPostsProvider`.",
    );
  }

  return blogPostsState;
};
