import {
  neighborsBehind,
  neighborsInFront,
  neighborsInRadius,
  neighborsOnPosition,
} from "./neighbor";

/** Neighbor Function tests */
const na = { position: [1, 1, 0], direction: [1, 0, 0] };
const nb = { position: [1, 2, 0], direction: [1, 1, 0] };
const nc = { position: [-1, 1, 0] };
const nd = { position: [1, 1, 0] };
const ne = { position: [2, 3, 0] };
const nf = { position: [3, 2, 0] };
const ng = { position: [6, 6, -1], direction: [1, 0, 0] };
const nh = { position: [6, 9, 0] };
const ni = { position: [4, 9, 0] };
const nj = { position: [3, 2, 2] };
const nk = { position: [3, 1, 0] };
const nl = { position: [1, 0, 0], direction: [1, 1, 1] };
const nm = { position: [0, 1, 0] };
const nn = { position: [0, -1, -1] };

test("find neighbors with same position", () => {
  expect(neighborsOnPosition(na, [nb, nc, nd, ne, nf])).toEqual([
    { position: [1, 1, 0] },
  ]);
});

test("find neighbors within a radius of 3", () => {
  expect(
    neighborsInRadius(ng, [na, nb, nc, nd, ne, nf, nh, ni], 3, 0, "chebyshev"),
  ).toEqual([{ position: [6, 9, 0] }, { position: [4, 9, 0] }]);
});

test("find neighbors within a max radius of 4 and min radius of 3", () => {
  expect(
    neighborsInRadius(ng, [na, nb, nc, nd, nf, nh, ni, nj], 4, 3.5),
  ).toEqual([ni]);

  expect(
    neighborsInRadius(
      ng,
      [na, nb, nc, nd, nf, nh, ni, nj],
      7,
      3.5,
      "euclidean",
      true,
    ),
  ).toEqual([nb, nf, ni, nj]);
});

test("find neighbors in front of agent tests", () => {
  expect(neighborsInFront(nb, [na, nc, ne, nf, ng, nh, nj])).toEqual([
    { position: [2, 3, 0] },
    { position: [3, 2, 0] },
    { position: [6, 6, -1], direction: [1, 0, 0] },
    { position: [6, 9, 0] },
    { position: [3, 2, 2] },
  ]);

  expect(
    neighborsInFront(na, [nb, nc, ne, nf, ng, nh, nj, nk, nl], true),
  ).toEqual([{ position: [3, 1, 0] }]);

  expect(
    neighborsInFront(nl, [na, nb, nc, ne, nf, ng, nh, nj, nk], true),
  ).toEqual([{ position: [3, 2, 2] }]);

  expect(neighborsInFront(nb, [na, nc, ne, nf, ng, nh, nj, nk], true)).toEqual([
    { position: [2, 3, 0] },
  ]);
});

test("find neighbors located behind agent tests", () => {
  expect(neighborsBehind(nb, [na, ne, ng, nh, nj, nm])).toEqual([
    { position: [1, 1, 0], direction: [1, 0, 0] },
    { position: [0, 1, 0] },
  ]);

  expect(neighborsBehind(nb, [na, ne, ng, nh, nj, nm], true)).toEqual([
    { position: [0, 1, 0] },
  ]);

  expect(neighborsBehind(na, [nb, nc, ne, ng, nh, nj, nm], true)).toEqual([
    { position: [-1, 1, 0] },
    { position: [0, 1, 0] },
  ]);

  expect(
    neighborsBehind(nl, [na, nb, nc, ne, ng, nh, nj, nm, nn], true),
  ).toEqual([{ position: [0, -1, -1] }]);
});
