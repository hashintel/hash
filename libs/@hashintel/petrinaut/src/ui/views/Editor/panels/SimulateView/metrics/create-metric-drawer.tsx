import { MetricDrawer } from "./metric-drawer";

export const CreateMetricDrawer = ({ onClose }: { onClose: () => void }) => (
  <MetricDrawer onClose={onClose} />
);
