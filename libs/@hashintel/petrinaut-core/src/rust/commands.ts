import type { MutationActionInput } from "../action-schemas";
import type { ArcEndpoint, InputArcType } from "../types/sdcpn";

type DirectMutation =
  | "commitNodePositions"
  | "updatePlace"
  | "removePlace"
  | "updateTransition"
  | "removeTransition";

export type RustArcTarget = Pick<
  MutationActionInput<"removeArc">,
  "targetSubnetId" | "transitionId" | "arcDirection"
> & { endpoint: ArcEndpoint };

export type RustCommand =
  | {
      [Name in DirectMutation]: {
        type: Name;
        input: Name extends "updatePlace" | "updateTransition"
          ? MutationActionInput<Name> & { unset?: string[] }
          : MutationActionInput<Name>;
      };
    }[DirectMutation]
  | {
      type: "addPlace";
      input: {
        targetSubnetId?: string | null;
        place: Omit<MutationActionInput<"addPlace">, "targetSubnetId">;
      };
    }
  | {
      type: "addTransition";
      input: {
        targetSubnetId?: string | null;
        transition: Omit<
          MutationActionInput<"addTransition">,
          "targetSubnetId"
        >;
      };
    }
  | {
      type: "addArc";
      input: { target: RustArcTarget; weight: number; type?: InputArcType };
    }
  | {
      type: "removeArc";
      input: RustArcTarget;
    }
  | {
      type: "updateArcWeight";
      input: { target: RustArcTarget; weight: number };
    }
  | {
      type: "updateArcType";
      input: { target: RustArcTarget; type: InputArcType };
    }
  | {
      type: "updateArcPlace";
      input: { target: RustArcTarget; newEndpoint: ArcEndpoint };
    };
