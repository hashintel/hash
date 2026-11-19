import { use } from "react";

import { IconFillContext } from "./filled-shape";
import { projectCube, projectCubeFaces } from "./shared/cube-projection";

export const CubeGeometry = () => {
  const filled = use(IconFillContext);

  return (
    <g data-icon-cube="" data-cube-angle="35">
      {filled &&
        projectCubeFaces(35).map((face) => (
          <path
            key={face.index}
            data-cube-face={face.index}
            data-icon-draw={`face-${face.index}`}
            pathLength="1"
            d={face.path}
            fill="currentColor"
            fillOpacity={face.opacity}
            stroke="none"
            visibility={face.visible ? "visible" : "hidden"}
          />
        ))}
      {projectCube(35).map((edge) => (
        <path
          key={edge.index}
          data-icon-draw={`edge-${edge.index}`}
          pathLength="1"
          data-cube-edge={edge.index}
          d={edge.path}
          visibility={edge.visible ? "visible" : "hidden"}
        />
      ))}
    </g>
  );
};
