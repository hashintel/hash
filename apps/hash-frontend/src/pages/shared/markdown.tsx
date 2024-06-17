import ReactMarkdown, { Components } from "react-markdown";
import remarkGfm from "remark-gfm";

type MarkdownProps = {
  markdown: string;
};

const components: Partial<Components> = {};

export const Markdown = ({ markdown }: MarkdownProps) => {
  return (
    <ReactMarkdown components={components} remarkPlugins={[remarkGfm]}>
      {markdown}
    </ReactMarkdown>
  );
};
