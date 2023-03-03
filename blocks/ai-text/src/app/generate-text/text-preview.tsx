export const TextPreview = ({
  onConfirm,
  onDiscard,
  text,
}: {
  onConfirm: () => void;
  onDiscard: () => void;
  text: string;
}) => {
  return (
    <div
      style={{
        border: "1px solid rgba(122, 202, 250, 1)",
        borderRadius: 10,
        marginTop: 30,
      }}
    >
      <div
        style={{
          background: "#E0F4FF",
          borderRadius: "10px 10px 0 0",
          padding: "20px 35px",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div>
            <div
              style={{
                fontSize: 18,
                color: "rgba(55, 67, 79, 1)",
                fontWeight: 500,
              }}
            >
              GENERATED TEXT
            </div>
            <div style={{ fontSize: 16, color: "rgba(117, 138, 161, 1)" }}>
              Insert or discard the below
            </div>
          </div>

          <div>
            <button
              onClick={onConfirm}
              style={{
                border: "1px solid rgba(221, 231, 240, 1)",
                borderRadius: 4,
                background: "rgba(7, 117, 227, 1)",
                color: "white",
                cursor: "pointer",
                fontFamily: "colfax-web",
                fontSize: 14,
                fontWeight: 500,
                marginRight: 15,
                padding: "12px 16px",
              }}
              type="button"
            >
              Insert into page
            </button>
            <button
              onClick={onDiscard}
              style={{
                background: "white",
                border: "1px solid rgba(221, 231, 240, 1)",
                borderRadius: 4,
                cursor: "pointer",
                fontFamily: "colfax-web",
                fontSize: 14,
                padding: "12px 16px",
              }}
              type="button"
            >
              Discard
            </button>
          </div>
        </div>
      </div>

      <div
        style={{
          borderRadius: "0 0 10px 10px",
          padding: "20px 35px",
        }}
      >
        <p style={{ whiteSpace: "pre-wrap" }}>{text}</p>
      </div>
    </div>
  );
};
