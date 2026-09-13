type Point3 = readonly [number, number, number];

const vertices: readonly Point3[] = [
  [-1, -1, -1],
  [1, -1, -1],
  [1, 1, -1],
  [-1, 1, -1],
  [-1, -1, 1],
  [1, -1, 1],
  [1, 1, 1],
  [-1, 1, 1],
];
const faces = [
  { normal: [0, 0, -1], vertices: [0, 1, 2, 3] },
  { normal: [0, 0, 1], vertices: [4, 5, 6, 7] },
  { normal: [-1, 0, 0], vertices: [0, 3, 7, 4] },
  { normal: [1, 0, 0], vertices: [1, 2, 6, 5] },
  { normal: [0, -1, 0], vertices: [0, 1, 5, 4] },
  { normal: [0, 1, 0], vertices: [3, 2, 6, 7] },
] satisfies { normal: Point3; vertices: number[] }[];
const edges = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 0],
  [4, 5],
  [5, 6],
  [6, 7],
  [7, 4],
  [0, 4],
  [1, 5],
  [2, 6],
  [3, 7],
] as const;

export const projectCube = (degrees: number) => {
  const yaw = (degrees * Math.PI) / 180;
  const pitch = -Math.PI / 7;
  const rotate = ([horizontal, vertical, depth]: Point3): Point3 => {
    const turnedDepth = -horizontal * Math.sin(yaw) + depth * Math.cos(yaw);
    return [
      horizontal * Math.cos(yaw) + depth * Math.sin(yaw),
      vertical * Math.cos(pitch) - turnedDepth * Math.sin(pitch),
      vertical * Math.sin(pitch) + turnedDepth * Math.cos(pitch),
    ];
  };
  const visibleFaces = faces.filter((face) => rotate(face.normal)[2] > 0.00001);
  const projected = vertices.map((vertex) => {
    const [horizontal, vertical] = rotate(vertex);
    return `${(12 + horizontal * 5.8).toFixed(3)} ${(12 + vertical * 5.8).toFixed(3)}`;
  });
  return edges.map(([start, end], index) => ({
    index,
    path: `M${projected[start]}L${projected[end]}`,
    visible: visibleFaces.some(
      (face) => face.vertices.includes(start) && face.vertices.includes(end),
    ),
  }));
};

export const paintCube = (root: Element, angle: number) => {
  root.setAttribute("data-cube-angle", String(angle));
  const paths = root.querySelectorAll<SVGPathElement>("[data-cube-edge]");
  for (const edge of projectCube(angle)) {
    const path = paths[edge.index];
    path?.setAttribute("d", edge.path);
    path?.setAttribute("visibility", edge.visible ? "visible" : "hidden");
  }
};

export const animateCube = (
  root: Element,
  target: number,
  duration: number,
) => {
  const start = Number(root.getAttribute("data-cube-angle") ?? 35);
  let frame = 0;
  let started: number | undefined;
  const tick = (now: number) => {
    started ??= now;
    const progress = Math.min(1, (now - started) / duration);
    const eased = 1 - (1 - progress) ** 3;
    paintCube(root, start + (target - start) * eased);
    if (progress < 1) frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(frame);
};
