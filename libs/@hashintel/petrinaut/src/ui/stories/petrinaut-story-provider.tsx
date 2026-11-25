import { useState } from "react";

import {
  createJsonDocHandle,
  generatePetrinautId,
  type PetrinautDocHandle,
  type PetrinautHandleCapabilities,
  type SDCPN,
} from "@hashintel/petrinaut-core";

import {
  defaultPetrinautNavigationState,
  type PetrinautNavigationState,
} from "../../react/navigation/navigation";
import { Petrinaut, type PetrinautProps } from "../petrinaut";

const emptySDCPN: SDCPN = {
  places: [],
  transitions: [],
  types: [],
  parameters: [],
  differentialEquations: [],
};

/** One handle per net, so a net's history survives switching to another. */
type StoryNet = { title: string; handle: PetrinautDocHandle };

/** Every story net reports the time the story loaded as its last update. */
const storyLoadedAt = new Date().toISOString();

/**
 * {@link Petrinaut} over a small in-memory registry of nets, as a host that
 * stores nets would mount it. For stories and the benchmark page.
 *
 * The first net and the first location are read once: give the provider a
 * `key` to start again from other ones.
 */
export const PetrinautStoryProvider = ({
  initialTitle = "New Process",
  initialDefinition = emptySDCPN,
  capabilities,
  initialNavigation,
  ...editorProps
}: {
  initialTitle?: string;
  initialDefinition?: SDCPN;
  /** What the first net's handle supports: every extension, when left out. */
  capabilities?: PetrinautHandleCapabilities;
  /** Where the editor opens. The story holds the location when this is set. */
  initialNavigation?: Partial<PetrinautNavigationState>;
} & Pick<
  PetrinautProps,
  | "plugins"
  | "readonly"
  | "hideNetManagementControls"
  | "rules"
  | "resolveImport"
  | "libraries"
>) => {
  const [initialNet] = useState<StoryNet>(() => ({
    title: initialTitle,
    handle: createJsonDocHandle({
      id: generatePetrinautId(),
      initial: initialDefinition,
      capabilities,
    }),
  }));
  const [nets, setNets] = useState([initialNet]);
  const [currentNetId, setCurrentNetId] = useState(initialNet.handle.id);
  const [navigationState, setNavigationState] =
    useState<PetrinautNavigationState>({
      ...defaultPetrinautNavigationState,
      ...initialNavigation,
    });

  const currentNet =
    nets.find((net) => net.handle.id === currentNetId) ?? initialNet;

  return (
    <Petrinaut
      {...editorProps}
      handle={currentNet.handle}
      title={currentNet.title}
      setTitle={(title) =>
        setNets((current) =>
          current.map((net) =>
            net.handle.id === currentNet.handle.id ? { ...net, title } : net,
          ),
        )
      }
      existingNets={nets.map((net) => ({
        netId: net.handle.id,
        title: net.title,
        lastUpdated: storyLoadedAt,
      }))}
      createNewNet={({ petriNetDefinition, title }) => {
        const handle = createJsonDocHandle({
          id: generatePetrinautId(),
          initial: petriNetDefinition,
        });
        setNets((current) => [...current, { title, handle }]);
        setCurrentNetId(handle.id);
      }}
      loadPetriNet={setCurrentNetId}
      navigation={
        initialNavigation && {
          state: navigationState,
          onNavigate: setNavigationState,
        }
      }
    />
  );
};
