export const Image = ({
  description,
  url,
}: {
  description: string;
  url: string;
}) => (
  <img
    alt={description}
    src={url}
    style={{
      objectFit: "contain",
      width: "auto",
      height: 400,
      maxHeight: "50vh",
      padding: 5,
    }}
  />
);
