import { cx } from "@hashintel/ds-helpers/css";

import { styles } from "./form-section.recipe";

export const FormSection = ({
  className,
  children,
}: {
  children: React.ReactNode;
  className?: string;
}) => {
  const classes = styles();

  return (
    <div className={cx(classes.section, className)} data-part="form-section">
      {children}
    </div>
  );
};
