import { expectTypeOf, test } from "vitest";

import type {
  PetrinautAiVoiceModeControls,
  PetrinautAiVoiceModeSessionControls,
} from "./ai-assistant-composer-control";

test("keeps legacy Voice controls required while sessions advertise capabilities", () => {
  expectTypeOf<PetrinautAiVoiceModeControls["reconnect"]>().toEqualTypeOf<
    () => void
  >();
  expectTypeOf<PetrinautAiVoiceModeControls["resume"]>().toEqualTypeOf<
    () => void
  >();
  expectTypeOf<
    PetrinautAiVoiceModeControls["setMicrophoneMuted"]
  >().toEqualTypeOf<(muted: boolean) => void>();

  expectTypeOf<
    PetrinautAiVoiceModeSessionControls["reconnect"]
  >().toEqualTypeOf<(() => void) | undefined>();
  expectTypeOf<PetrinautAiVoiceModeSessionControls["resume"]>().toEqualTypeOf<
    (() => void) | undefined
  >();
  expectTypeOf<
    PetrinautAiVoiceModeSessionControls["setMicrophoneMuted"]
  >().toEqualTypeOf<((muted: boolean) => void) | undefined>();
});
