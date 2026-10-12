/**
 * Host notice for a change the repository refused to save. Centred below
 * Petrinaut's 64px top bar and stacked above its side panels (z-index 1097)
 * and bar (1100), so neither can hide it.
 */
export const UnsavedChangeNotice = ({ message }: { message: string }) => (
  <div
    style={{
      alignItems: "center",
      display: "flex",
      flexDirection: "column",
      fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
      fontSize: 14,
      gap: 8,
      left: "50%",
      maxWidth: "calc(100vw - 32px)",
      pointerEvents: "none",
      position: "fixed",
      top: 80,
      transform: "translateX(-50%)",
      zIndex: 1200,
    }}
  >
    <p
      role="alert"
      style={{
        background: "#fff1f0",
        border: "1px solid #ffa39e",
        borderRadius: 8,
        boxShadow: "0 2px 8px rgba(20, 33, 50, 0.12)",
        color: "#a8071a",
        margin: 0,
        padding: "10px 12px",
      }}
    >
      Changes not saved: {message} The editor shows the last saved version.
    </p>
  </div>
);
