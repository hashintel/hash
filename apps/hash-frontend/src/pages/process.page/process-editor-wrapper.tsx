import "reactflow/dist/style.css";

import type { EntityId } from "@blockprotocol/type-system";
import { AlertModal } from "@hashintel/design-system";
import { Box, Stack } from "@mui/material";
import { useCallback, useMemo, useRef, useState } from "react";

import { Button } from "../../shared/ui";
import { exampleCPN } from "./process-editor-wrapper/examples";
import { ProcessEditBar } from "./process-editor-wrapper/process-edit-bar";
import { ProcessEditor } from "./process-editor-wrapper/process-editor";
import { defaultTokenTypes } from "./process-editor-wrapper/process-editor/token-types";
import type { PetriNetDefinitionObject } from "./process-editor-wrapper/process-editor/types";
import { TitleAndNetSelect } from "./process-editor-wrapper/title-and-net-select";
import { useConvertToPnml } from "./process-editor-wrapper/use-convert-to-pnml";
import { useLoadFromPnml } from "./process-editor-wrapper/use-load-from-pnml";
import {
  type PersistedNet,
  useProcessSaveAndLoad,
} from "./process-editor-wrapper/use-process-save-and-load";

export const ProcessEditorWrapper = () => {
  const [selectedNetId, setSelectedNetId] = useState<EntityId | null>(null);
  const [title, setTitle] = useState<string>("Process");
  const [parentProcess, setParentProcess] = useState<{
    parentProcessId: EntityId;
    title: string;
  } | null>(null);

  const [petriNet, setPetriNet] = useState<PetriNetDefinitionObject>({
    arcs: [],
    nodes: [],
    tokenTypes: defaultTokenTypes,
  });

  const [switchTargetPendingConfirmation, setSwitchTargetPendingConfirmation] =
    useState<PersistedNet | null>(null);

  const {
    discardChanges,
    isDirty,
    loadPersistedNet,
    persistedNets,
    persistPending,
    persistToGraph,
    userEditable,
    setUserEditable,
  } = useProcessSaveAndLoad({
    parentProcess,
    petriNet,
    selectedNetId,
    setParentProcess,
    setPetriNet,
    setSelectedNetId,
    setTitle,
    title,
  });

  const handleResetAll = useCallback(() => {
    setPetriNet({
      arcs: [],
      nodes: [],
      tokenTypes: defaultTokenTypes,
    });

    setSelectedNetId(null);
    setParentProcess(null);
    setUserEditable(true);
    setTitle("Process");
  }, [setParentProcess, setSelectedNetId, setUserEditable, setTitle]);

  const handleLoadExample = useCallback(() => {
    const nodesWithInitialCounts = exampleCPN.nodes.map((node) => {
      if (node.data.type === "place") {
        return {
          ...node,
          data: {
            ...node.data,
            initialTokenCounts: { ...node.data.tokenCounts },
          },
        };
      }
      return node;
    });

    setPetriNet({
      arcs: exampleCPN.arcs,
      nodes: nodesWithInitialCounts,
      tokenTypes: exampleCPN.tokenTypes,
    });

    setUserEditable(false);
    setTitle(exampleCPN.title);
    setSelectedNetId(null);
  }, [setUserEditable, setTitle, setSelectedNetId]);

  const convertToPnml = useConvertToPnml({
    petriNet,
    title,
  });

  const handleExport = () => {
    const pnml = convertToPnml();

    const blob = new Blob([pnml], { type: "application/xml" });

    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "process.pnml";

    document.body.appendChild(a);
    a.click();

    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 0);
  };

  const loadFromPnml = useLoadFromPnml({
    setParentProcess,
    setPetriNetDefinition: setPetriNet,
    setSelectedNetId,
    setTitle,
    setUserEditable,
  });

  const handleLoadFromPnml = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) {
        return;
      }

      const reader = new FileReader();
      reader.onload = (readerEvent) => {
        const contents = readerEvent.target?.result;
        if (typeof contents === "string") {
          loadFromPnml(contents);
        }
      };
      reader.readAsText(file);
    },
    [loadFromPnml],
  );

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const switchToNet = useCallback(
    (net: PersistedNet) => {
      if (isDirty) {
        setSwitchTargetPendingConfirmation(net);
      } else {
        loadPersistedNet(net);
      }
    },
    [isDirty, loadPersistedNet],
  );

  const loadNetFromId = useCallback(
    (netId: EntityId) => {
      const foundNet = persistedNets.find((net) => net.entityId === netId);

      if (!foundNet) {
        throw new Error(`Net ${netId} not found`);
      }

      loadPersistedNet(foundNet);
    },
    [loadPersistedNet, persistedNets],
  );

  const childProcessOptions = useMemo(() => {
    return persistedNets
      .filter((net) => net.userEditable && net.entityId !== selectedNetId)
      .map((net) => ({
        netId: net.entityId,
        title: net.title,
      }));
  }, [persistedNets, selectedNetId]);

  return (
    <Stack sx={{ height: "100%" }}>
      {switchTargetPendingConfirmation && (
        <AlertModal
          callback={() => {
            setSwitchTargetPendingConfirmation(null);
            loadPersistedNet(switchTargetPendingConfirmation);
          }}
          calloutMessage="You have unsaved changes which will be discarded. Are you sure you want to switch to another net?"
          confirmButtonText="Switch"
          contentStyle={{
            maxWidth: 450,
          }}
          header="Switch and discard changes?"
          open
          close={() => setSwitchTargetPendingConfirmation(null)}
          type="warning"
        />
      )}
      <ProcessEditBar
        discardChanges={discardChanges}
        isDirty={isDirty}
        persistToGraph={persistToGraph}
        persistPending={persistPending}
        userEditable={userEditable}
        selectedNetId={selectedNetId}
      />
      <TitleAndNetSelect
        parentProcess={parentProcess}
        persistedNets={persistedNets}
        selectedNetId={selectedNetId}
        setTitle={setTitle}
        switchToNet={switchToNet}
        title={title}
      />

      <Box sx={{ width: "100%", height: "100%", position: "relative" }}>
        <ProcessEditor
          childProcessOptions={childProcessOptions}
          petriNet={petriNet}
          parentProcess={parentProcess}
          setPetriNet={setPetriNet}
          readonly={!userEditable}
          loadPetriNet={(id) => loadNetFromId(id as EntityId)}
        />

        <Stack
          direction="row"
          spacing={1}
          sx={{ position: "absolute", bottom: 16, right: 16, zIndex: 100 }}
        >
          <Button onClick={handleLoadExample} size="xs" variant="tertiary">
            Load Example
          </Button>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleLoadFromPnml}
            accept=".pnml,.xml"
            style={{ display: "none" }}
          />
          <Button onClick={handleImportClick} size="xs" variant="tertiary">
            Import
          </Button>
          <Button onClick={handleExport} size="xs" variant="tertiary">
            Export
          </Button>
          <Button onClick={handleResetAll} size="xs" variant="danger">
            New
          </Button>
        </Stack>
      </Box>
    </Stack>
  );
};
