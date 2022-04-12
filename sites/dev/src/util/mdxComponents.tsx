import { Box, Typography } from "@mui/material";
import { ReactNode } from "react";
import { BlogPostContent, BlogPostHead } from "../components/BlogPost";

export const mdxComponents: Record<string, ReactNode> = {
  Box,
  Typography,
  BlogPostHead,
  BlogPostContent,
};
