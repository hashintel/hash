import { MetricDrawer } from "./metric-drawer";

export const CreateMetricDrawer = ({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) => (open ? <MetricDrawer onClose={onClose} /> : null);
