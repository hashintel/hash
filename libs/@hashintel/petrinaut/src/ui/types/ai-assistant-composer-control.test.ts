import { expectTypeOf, test } from "vitest";

import type {
  PetrinautAiVoiceModeContext,
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

test("accepts an existing context implementation with complete control registration", () => {
  type ExistingVoiceModeContext = Omit<
    PetrinautAiVoiceModeContext,
    "registerVoiceModeControls"
  > & {
    registerVoiceModeControls: (
      controls: PetrinautAiVoiceModeControls,
    ) => () => void;
  };

  const existingContext = {} as ExistingVoiceModeContext;
  const currentContext: PetrinautAiVoiceModeContext = existingContext;

  expectTypeOf(currentContext).toEqualTypeOf<PetrinautAiVoiceModeContext>();
});
