import { VersionedUrl } from "@blockprotocol/type-system";
import { Backdrop } from "@mui/material";
import { FunctionComponent, useCallback, useState } from "react";

import { TypeSlideOverSlide } from "./type-slide-over-stack/type-slide-over-slide";

export const TypeSlideOverStack: FunctionComponent<{
  rootTypeId: VersionedUrl;
  onClose: () => void;
}> = ({ rootTypeId, onClose }) => {
  const [animateOut, setAnimateOut] = useState(false);
  const [items, setItems] = useState<VersionedUrl[]>([rootTypeId]);

  if (rootTypeId !== items[0]) {
    setItems([rootTypeId]);
  }

  const handleClose = useCallback(() => {
    setAnimateOut(true);

    setTimeout(() => {
      setAnimateOut(false);
      setItems([]);
      onClose();
    }, 300);
  }, [setAnimateOut, setItems, onClose]);

  return (
    <Backdrop
      open={!animateOut}
      onClick={handleClose}
      sx={{ zIndex: ({ zIndex }) => zIndex.drawer + 2 }}
    >
      {items.map((typeId, index) => (
        <TypeSlideOverSlide
          // eslint-disable-next-line react/no-array-index-key
          key={`${index}-${typeId}`}
          open={!animateOut}
          onBack={index > 0 ? () => setItems(items.slice(0, index)) : undefined}
          onClose={handleClose}
          onNavigateToType={(url) => setItems([...items, url])}
          typeUrl={typeId}
          stackPosition={index}
        />
      ))}
    </Backdrop>
  );
};
