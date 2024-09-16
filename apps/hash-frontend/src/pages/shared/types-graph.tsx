import { SigmaContainer } from "@react-sigma/core";
import dynamic from "next/dynamic";
import {
  TypesGraphLoader,
  TypesGraphProps,
} from "./types-graph/types-graph-loader";

export const TypesGraph = ({ subgraph }: TypesGraphProps) => {
  if (typeof window !== "undefined") {
    const SigmaContainer = dynamic(
      import("@react-sigma/core").then((mod) => mod.SigmaContainer),
      { ssr: false },
    );

    const TypesGraphLoader = dynamic(
      import("./types-graph/types-graph-loader").then(
        (mod) => mod.TypesGraphLoader,
      ),
      { ssr: false },
    );

    return (
      <SigmaContainer>
        <TypesGraphLoader subgraph={subgraph} />
      </SigmaContainer>
    );
  } else return <p>NOT AVAILABLE</p>;
};
