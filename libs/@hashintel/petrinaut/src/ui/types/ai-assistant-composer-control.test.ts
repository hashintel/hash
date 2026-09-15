import { expectTypeOf, test } from "vitest";

import type {
  PetrinautAiVoiceModeContext,
  PetrinautAiVoiceModeControls,
  PetrinautAiVoiceModeSessionControls,
} from "./ai-assistant-composer-control";
import type { VoiceSessionActions } from "../../react/voice-session/store";

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

test("exposes optional provider-neutral speaker controls", () => {
  expectTypeOf<
    PetrinautAiVoiceModeControls["setSpeakerMuted"]
  >().toEqualTypeOf<((muted: boolean) => void) | undefined>();
  expectTypeOf<
    PetrinautAiVoiceModeControls["setSpeakerVolume"]
  >().toEqualTypeOf<((volume: number) => void) | undefined>();
  expectTypeOf<
    PetrinautAiVoiceModeSessionControls["setSpeakerMuted"]
  >().toEqualTypeOf<((muted: boolean) => void) | undefined>();
  expectTypeOf<
    PetrinautAiVoiceModeSessionControls["setSpeakerVolume"]
  >().toEqualTypeOf<((volume: number) => void) | undefined>();
  expectTypeOf<VoiceSessionActions["setSpeakerMuted"]>().toEqualTypeOf<
    ((muted: boolean) => void) | undefined
  >();
  expectTypeOf<VoiceSessionActions["setSpeakerVolume"]>().toEqualTypeOf<
    ((volume: number) => void) | undefined
  >();
});
