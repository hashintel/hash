import { css, cx } from "@hashintel/ds-helpers/css";
import { refractive } from "@hashintel/refractive";

const containerStyle = css({
  position: "absolute",
  top: "[40px]",
  left: "[50%]",
  transform: "[translateX(-50%)]",
  zIndex: "[10000]",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: "[8px]",
  pointerEvents: "none",
});

const animationWrapperStyle = css({
  animation: "fadeIn 0.2s ease-out",
  pointerEvents: "auto",
});

const exitingWrapperStyle = css({
  animation: "fadeOut 0.2s ease-in forwards",
});

const notificationStyle = css({
  backgroundColor: "[rgba(34, 197, 94, 0.1)]",
  color: "[#16a34a]",
  fontFamily: "[Inter, sans-serif]",
  fontSize: "[15px]",
  boxShadow: "[0 6px 12px rgba(0, 0, 0, 0.1)]",
  padding: "[20px 40px]",
  maxWidth: "[600px]",
  textAlign: "center",
  userSelect: "none",
});

export type SimulationToast = {
  id: number;
  message: string;
  exiting: boolean;
};

/**
 * Renders transient toasts surfaced by `<SimulationProvider>` from the active
 * simulation's `events` stream. Today only "Simulation complete" is surfaced;
 * other event-types could surface here too.
 */
export const SimulationToaster: React.FC<{ toasts: SimulationToast[] }> = ({
  toasts,
}) => {
  if (toasts.length === 0) {
    return null;
  }

  return (
    <div className={containerStyle}>
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={cx(
            animationWrapperStyle,
            toast.exiting && exitingWrapperStyle,
          )}
        >
          <refractive.div
            refraction={{ radius: 31, blur: 3, bezelWidth: 20 }}
            className={notificationStyle}
          >
            {toast.message}
          </refractive.div>
        </div>
      ))}
    </div>
  );
};
