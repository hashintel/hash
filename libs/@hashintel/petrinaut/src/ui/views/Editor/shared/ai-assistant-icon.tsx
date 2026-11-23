import { HashIcon } from "@hashintel/ds-icons";

/** The assistant's mark, the same wherever the editor shows it. */
export const AiAssistantIcon = ({
  size,
  className,
}: {
  size: number;
  className?: string;
}) => <HashIcon name="agent" size={size} className={className} />;
