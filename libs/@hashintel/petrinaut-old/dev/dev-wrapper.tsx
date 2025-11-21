import { CacheProvider } from "@emotion/react";
import {
  createEmotionCache,
  fluidTypographyStyles,
  theme,
} from "@hashintel/design-system/theme";
import { useLocalStorage } from "@mantine/hooks";
import { ThemeProvider } from "@mui/material";
import { produce } from "immer";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Petrinaut } from "../src/petrinaut";
import type {
  MinimalNetMetadata,
  PetriNetDefinitionObject,
} from "../src/petrinaut/types";

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
    getInitialValueInEffect: false,
  });

  const [currentNetId, setCurrentNetId] = useState<string | null>(null);

  const currentNet = useMemo(() => {
    if (!currentNetId) {
      return null;
    }
    return storedNets.find((net) => net.id === currentNetId) ?? null;
  }, [currentNetId, storedNets]);

  const existingNets: MinimalNetMetadata[] = useMemo(() => {
    return storedNets
      .filter((net) => net.id !== currentNetId)
      .map((net) => ({
        netId: net.id,
        title: net.title,
      }));
  }, [currentNetId, storedNets]);

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
      if (!currentNetId) {
        return;
      }

      setStoredNets((prev) =>
        prev.map((net) => (net.id === currentNetId ? { ...net, title } : net)),
      );
    },
    [currentNetId, setStoredNets],
  );

  const mutatePetriNetDefinition = useCallback(
    (definitionMutationFn: (draft: PetriNetDefinitionObject) => void) => {
      if (!currentNetId) {
        return;
      }

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
  useEffect(() => {
    if (!storedNets[0]) {
      createNewNet({
        petriNetDefinition: {
          arcs: [],
          nodes: [],
          tokenTypes: [],
        },
        title: "New Process",
      });
    } else if (!currentNetId) {
      setCurrentNetId(storedNets[0].id);
    }
  }, [storedNets.length, currentNetId, createNewNet, storedNets]);

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
        <style type="text/css">
          {fluidTypographyStyles(":root")}
          {`
          html {
            font-family: ${theme.typography.fontFamily};
          }
        `}
        </style>
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
