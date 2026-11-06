/**
 * A title slide: the talk's name large at the foot of the slide, the
 * subtitle under it, anything else after that, and the author on a rule
 * below. An MDX slide with `layout: title` is this slide; a TSX deck opens
 * with it the same way.
 */

import { Slide } from "./slide";

import type { ReactNode } from "react";

export const TitleSlide = ({
  title,
  subtitle,
  author,
  children,
}: {
  title: string;
  subtitle?: string;
  author?: string;
  children?: ReactNode;
}) => (
  <Slide className="deck-mdx deck-title">
    <h1 className="deck-title__title">{title}</h1>
    {subtitle === undefined ? null : (
      <p className="deck-title__subtitle">{subtitle}</p>
    )}
    <div className="deck-title__body">{children}</div>
    {author === undefined ? null : (
      <p className="deck-title__author">{author}</p>
    )}
  </Slide>
);
