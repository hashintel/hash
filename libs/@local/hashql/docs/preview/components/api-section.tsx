import type { SectionProps } from "../../lib/components.js";
import type { ReactNode } from "react";

export function ApiSection({ title, children }: SectionProps): ReactNode {
  return (
    <div className="api-section">
      <h4 className="api-section-title">{title}</h4>
      {children}
    </div>
  );
}
