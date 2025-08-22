import type { AutomergeUrl, DocHandle } from "@automerge/react";
import {
  BroadcastChannelNetworkAdapter,
  IndexedDBStorageAdapter,
  Repo,
  useDocument,
  useDocuments,
  WebSocketClientAdapter,
} from "@automerge/react";
import type { PetriNetDefinitionObject } from "@hashintel/petrinaut";
import { useEffect, useState } from "react";
import { useLocalstorageState } from "rooks";

import type { NextPageWithLayout } from "../shared/layout";
import { getLayoutWithSidebar } from "../shared/layout";
import { ProcessEditorWrapper } from "./process.page/process-editor-wrapper";

type RootDocument = {
  petriNetUrls: AutomergeUrl[];
};

declare global {
  interface Window {
    repo: Repo;
    // We also add the handle to the global window object for debugging
    handle: DocHandle<RootDocument>;
  }
}

const AutomergeProcessEditorWrapper = ({
  rootDocUrl,
}: { rootDocUrl: AutomergeUrl }) => {
  const [rootDoc, changeRootDoc] = useDocument<RootDocument>(rootDocUrl);

  const [petriNets] = useDocuments<PetriNetDefinitionObject[]>(
    rootDoc.petriNetUrls,
  );

  const [selectedPetriNetUrl, setSelectedPetriNetUrl] =
    useState<AutomergeUrl | null>(null);

  const [selectedPetriNetDoc, changeSelectedPetriNetDoc] =
    useDocument<PetriNetDefinitionObject>(selectedPetriNetUrl);

  console.log(petriNets);

  return (
    <div>
      {rootDoc?.petriNetUrls.map((url) => (
        <div key={url}>{url}</div>
      ))}
    </div>
  );
};

const ProcessAutomergePage: NextPageWithLayout = () => {
  const [repo, setRepo] = useState<Repo | null>(null);
  const [rootDocUrl, setRootDocUrl] = useLocalstorageState<AutomergeUrl | null>(
    "petrinaut-root-doc-url",
    null,
  );

  useEffect(() => {
    const newRepo = new Repo({
      network: [
        new BroadcastChannelNetworkAdapter(),
        new WebSocketClientAdapter("wss://sync.automerge.org"),
      ],
      storage: new IndexedDBStorageAdapter(),
    });

    // Add the repo to the global window object so it can be accessed in the browser console
    // This is useful for debugging and testing purposes.

    window.repo = newRepo;

    setRepo(newRepo);

    if (!rootDocUrl) {
      const rootDoc = newRepo.create<RootDocument>({
        petriNetUrls: [],
      });
      setRootDocUrl(rootDoc.url);
    }
  }, [rootDocUrl, setRootDocUrl]);

  return <ProcessEditorWrapper />;
};

ProcessAutomergePage.getLayout = (page) =>
  getLayoutWithSidebar(page, {
    fullWidth: true,
  });

export default ProcessAutomergePage;
