import { CacheProvider } from "@emotion/react";
import { ThemeProvider } from "@mui/material/styles";
import { createEmotionCache, theme } from "@hashintel/design-system/theme";
import { useLocalStorage } from "@mantine/hooks";
import { produce } from "immer";
import { useCallback, useMemo, useState } from "react";
import type {
  MinimalNetMetadata,
  PetriNetDefinitionObject,
} from "../src/petrinaut/types";
import { Petrinaut } from "../src/petrinaut";
import { defaultTokenTypes } from "../src/petrinaut";

const emotionCache = createEmotionCache();

type StoredNet = {
  id: string;
  title: string;
  petriNetDefinition: PetriNetDefinitionObject;
  createdAt: string;
};

export const DevWrapper = () => {
  const [storedNets, setStoredNets] = useLocalStorage<StoredNet[]>({
    key: "petrinaut-dev-nets",
    defaultValue: [],
  });

  const [currentNetId, setCurrentNetId] = useState<string | null>(null);

  const currentNet = useMemo(() => {
    if (!currentNetId) {
      return null;
    }
    return storedNets.find((net) => net.id === currentNetId) || null;
  }, [currentNetId, storedNets]);

  const existingNets: MinimalNetMetadata[] = useMemo(() => {
    return storedNets.map((net) => ({
      netId: net.id,
      title: net.title,
    }));
  }, [storedNets]);

  const createNewNet = useCallback(
    (params: {
      petriNetDefinition: PetriNetDefinitionObject;
      title: string;
    }) => {
      const newNet: StoredNet = {
        id: `net-${Date.now()}`,
        title: params.title,
        petriNetDefinition: params.petriNetDefinition,
        createdAt: new Date().toISOString(),
      };

      setStoredNets((prev) => [...prev, newNet]);
      setCurrentNetId(newNet.id);
    },
    [setStoredNets],
  );

  const loadPetriNet = useCallback((petriNetId: string) => {
    setCurrentNetId(petriNetId);
  }, []);

  const setTitle = useCallback(
    (title: string) => {
      if (!currentNetId) return;

      setStoredNets((prev) =>
        prev.map((net) => (net.id === currentNetId ? { ...net, title } : net)),
      );
    },
    [currentNetId, setStoredNets],
  );

  const mutatePetriNetDefinition = useCallback(
    (definitionMutationFn: (draft: PetriNetDefinitionObject) => void) => {
      if (!currentNetId) return;

      setStoredNets((prev) =>
        prev.map((net) => {
          if (net.id === currentNetId) {
            const newDefinition = produce(
              net.petriNetDefinition,
              definitionMutationFn,
            );
            return { ...net, petriNetDefinition: newDefinition };
          }
          return net;
        }),
      );
    },
    [currentNetId, setStoredNets],
  );

  // Initialize with a default net if none exists
  useMemo(() => {
    if (storedNets.length === 0 && !currentNetId) {
      createNewNet({
        petriNetDefinition: {
          arcs: [],
          nodes: [],
          tokenTypes: defaultTokenTypes,
        },
        title: "New Process",
      });
    }
  }, [storedNets.length, currentNetId, createNewNet]);

  if (!currentNet) {
    return (
      <CacheProvider value={emotionCache}>
        <ThemeProvider theme={theme}>
          <div style={{ padding: "20px", textAlign: "center" }}>
            <h2>Petrinaut Dev Mode</h2>
            <p>No net selected. Create a new net to get started.</p>
          </div>
        </ThemeProvider>
      </CacheProvider>
    );
  }

  return (
    <CacheProvider value={emotionCache}>
      <ThemeProvider theme={theme}>
        <div style={{ height: "100vh", width: "100vw" }}>
          <Petrinaut
            createNewNet={createNewNet}
            existingNets={existingNets}
            hideNetManagementControls={false}
            parentNet={null}
            petriNetId={currentNetId}
            petriNetDefinition={currentNet.petriNetDefinition}
            mutatePetriNetDefinition={mutatePetriNetDefinition}
            loadPetriNet={loadPetriNet}
            setTitle={setTitle}
            title={currentNet.title}
          />
        </div>
      </ThemeProvider>
    </CacheProvider>
  );
};
