import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

export type CollabPositions = Array<{
  userId?: string;
  userShortname?: string;
  userPreferredName: string;
  blockId: string;
}>;

interface IPageContext {
  collabPositions: CollabPositions;
}

const Page = createContext<Partial<IPageContext>>({});
const { Provider, Consumer } = Page;

const PageProvider: React.FC = ({ children, ...props }) => {
  const [collabPositions, setCollabPositions] = useState<CollabPositions>([
    {
      userPreferredName: "Akash",
      blockId: "b93975f6-a712-4bfa-b5d6-c94040703423",
    },
    {
      userPreferredName: "Ciaran",
      blockId: "b93975f6-a712-4bfa-b5d6-c94040703423",
    },
    {
      userPreferredName: "Nate",
      blockId: "b93975f6-a712-4bfa-b5d6-c94040703423",
    },
    {
      userPreferredName: "Eaden",
      blockId: "b93975f6-a712-4bfa-b5d6-c94040703423",
    },
  ]);

  const iterRef = useRef(0);

  useEffect(() => {
    const presenceChangeInterval = setInterval(() => {
      switch (iterRef.current) {
        case 0:
          setCollabPositions([
            {
              userPreferredName: "Akash",
              blockId: "b93975f6-a712-4bfa-b5d6-c94040703423",
            },
            {
              userPreferredName: "Eaden",
              blockId: "b93975f6-a712-4bfa-b5d6-c94040703423",
            },
          ]);
          iterRef.current = 1;
          break;

        case 1:
          setCollabPositions([
            {
              userPreferredName: "Akash",
              blockId: "b93975f6-a712-4bfa-b5d6-c94040703423",
            },
            {
              userPreferredName: "Ciaran",
              blockId: "b93975f6-a712-4bfa-b5d6-c94040703423",
            },
            {
              userPreferredName: "Nate",
              blockId: "b93975f6-a712-4bfa-b5d6-c94040703423",
            },
            {
              userPreferredName: "Eaden",
              blockId: "b93975f6-a712-4bfa-b5d6-c94040703423",
            },
          ]);

          iterRef.current = 2;
          break;

        case 2:
          // b2d44169-8cba-4707-b090-04745360946b

          setCollabPositions([
            {
              userPreferredName: "Akash",
              blockId: "b93975f6-a712-4bfa-b5d6-c94040703423",
            },
            {
              userPreferredName: "Ciaran",
              blockId: "b2d44169-8cba-4707-b090-04745360946b",
            },
          ]);

          iterRef.current = 0;
          break;
      }
    }, 2000);

    return () => {
      clearInterval(presenceChangeInterval);
    };
  }, []);

  const state = useMemo(() => {
    return {
      collabPositions,
    };
  }, [collabPositions]);

  console.log(state);

  return (
    <Provider value={state} {...props}>
      {children}
    </Provider>
  );
};

const usePageContext = () => {
  const state = useContext(Page);
  if (!state) {
    throw new Error("usePageContext must be called within PageProvider");
  }

  return {
    state,
  };
};

export { PageProvider, Consumer as PageConsumer, usePageContext };

export default Page;
