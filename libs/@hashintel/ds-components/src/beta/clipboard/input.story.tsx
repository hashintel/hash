import * as Clipboard from "../clipboard";
import { IconButton } from "../icon-button";
import { Input } from "../input";
import { InputGroup } from "../input-group";

const ClipboardIconButton = () => {
  return (
    <Clipboard.Trigger asChild>
      <IconButton variant="surface" size="xs" me="-2">
        <Clipboard.Indicator />
      </IconButton>
    </Clipboard.Trigger>
  );
};

export const App = () => {
  return (
    <Clipboard.Root value="https://park-ui.com">
      <Clipboard.Label textStyle="label">Document Link</Clipboard.Label>
      <InputGroup endElement={<ClipboardIconButton />}>
        <Clipboard.Input asChild>
          <Input />
        </Clipboard.Input>
      </InputGroup>
    </Clipboard.Root>
  );
};
