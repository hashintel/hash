import { AsteriskRegularIcon } from "./icon-asterisk-regular";
import { InputPipeIcon } from "./icon-input-pipe";
import { LinkIcon } from "./icon-link";

export const EntityTypeIcon = ({ fontSize }: { fontSize?: number }) => (
  <AsteriskRegularIcon
    sx={({ palette }) => ({ color: palette.blue[70], fontSize })}
  />
);

export const LinkTypeIcon = ({ fontSize }: { fontSize?: number }) => (
  <LinkIcon
    sx={({ palette }) => ({ color: palette.turquoise[60], fontSize })}
  />
);

export const PropertyTypeIcon = ({ fontSize }: { fontSize?: number }) => (
  <InputPipeIcon
    sx={({ palette }) => ({ color: palette.purple[60], fontSize })}
  />
);
