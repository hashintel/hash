// Spatial Functions
import {
  distanceBetween,
  neighborsBehind,
  neighborsInFront,
  neighborsInRadius,
  neighborsOnPosition,
  normalizeVector,
  random,
  randomPosition,
  setSeed,
} from "./stdlib";
import { incr } from "./stdlib";
test("should increment properly", async () => {
  expect(incr(1)).toBe(2);
});

/** Spatial Function tests */
const a = { position: [0, 0, 0], direction: [1, 1] };
const b = { position: [1, 1, 0], direction: [1, 3] };
const c = { position: [1, 6, 0] };
const d = { position: [1, 6, 2] };

const topology = { x_bounds: [0, 20], y_bounds: [0, 20], z_bounds: [0, 20] };

test("manhattan distanceBetween tests", () => {
  expect(distanceBetween(a, b, "manhattan")).toBe(2);
  expect(distanceBetween(a, c, "manhattan")).toBe(7);
  expect(distanceBetween(a, d, "manhattan")).toBe(9);
});

test("euclidean distanceBetween tests", () => {
  expect(distanceBetween(a, b, "euclidean")).toBe(1.4142135623730951);
  expect(distanceBetween(a, c, "euclidean")).toBe(6.082762530298219);
  expect(distanceBetween(a, d, "euclidean")).toBe(6.4031242374328485);
});

test("euclidean distanceBetween squared tests", () => {
  expect(distanceBetween(a, b, "euclidean_sq")).toBe(2);
  expect(distanceBetween(a, c, "euclidean_sq")).toBe(37);
  expect(distanceBetween(a, d, "euclidean_sq")).toBe(41);
});

test("chebyshev distanceBetween tests", () => {
  expect(distanceBetween(a, b, "chebyshev")).toBe(1);
  expect(distanceBetween(a, c, "chebyshev")).toBe(6);
  expect(distanceBetween(a, d, "chebyshev")).toBe(6);
});

test("random position", () => {
  expect(randomPosition(topology)[2]).toBe(0),
    expect(randomPosition(topology, true)[0]).toBeLessThanOrEqual(20);
});

test("normalize direction of [1,1]", () => {
  expect(normalizeVector(a.direction)).toEqual([
    0.7071067811865475,
    0.7071067811865475,
  ]);
});

test("normalize direction of [1,3]", () => {
  expect(normalizeVector(b.direction)).toEqual([
    0.31622776601683794,
    0.9486832980505138,
  ]);
});

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
  expect(neighborsInRadius(ng, [na, nb, nc, nd, ne, nf, nh, ni], 3)).toEqual([
    { position: [6, 9, 0] },
    { position: [4, 9, 0] },
  ]);
});

test("find neighbors within a max radius of 4 and min radius of 3", () => {
  expect(
    neighborsInRadius(ng, [na, nb, nc, nd, nf, nh, ni, nj], 4, 3)
  ).toEqual([{ position: [3, 2, 0] }, { position: [3, 2, 2] }]);
  expect(
    neighborsInRadius(ng, [na, nb, nc, nd, nf, nh, ni, nj], 4, 3, true)
  ).toEqual([{ position: [3, 2, 2] }]);
});

test("find neighbors in front of agent tests", () => {
  expect(neighborsInFront(nb, [na, nc, ne, nf, ng, nh, nj])).toEqual([
    { position: [2, 3, 0] },
    { position: [3, 2, 0] },
    { position: [6, 6, -1], direction: [1, 0, 0] },
    { position: [6, 9, 0] },
    { position: [3, 2, 2] },
  ]),
    expect(
      neighborsInFront(na, [nb, nc, ne, nf, ng, nh, nj, nk, nl], true)
    ).toEqual([{ position: [3, 1, 0] }]),
    expect(
      neighborsInFront(nl, [na, nb, nc, ne, nf, ng, nh, nj, nk], true)
    ).toEqual([{ position: [3, 2, 2] }]),
    expect(
      neighborsInFront(nb, [na, nc, ne, nf, ng, nh, nj, nk], true)
    ).toEqual([{ position: [2, 3, 0] }]);
});

test("find neighbors located behind agent tests", () => {
  expect(neighborsBehind(nb, [na, ne, ng, nh, nj, nm])).toEqual([
    { position: [1, 1, 0], direction: [1, 0, 0] },
    { position: [0, 1, 0] },
  ]),
    expect(neighborsBehind(nb, [a, ne, ng, nh, nj, nm], true)).toEqual([
      { position: [0, 1, 0] },
    ]),
    expect(neighborsBehind(na, [nb, nc, ne, ng, nh, nj, nm], true)).toEqual([
      { position: [-1, 1, 0] },
      { position: [0, 1, 0] },
    ]);
  expect(
    neighborsBehind(nl, [na, nb, nc, ne, ng, nh, nj, nm, nn], true)
  ).toEqual([{ position: [0, -1, -1] }]);
});

test("setting seed of random function returns same number each time", () => {
  let n = random();
  let nn = random();
  expect(n).not.toEqual(nn);
  setSeed("test");
  n = random();
  setSeed("test");
  nn = random();
  expect(n).toEqual(nn);
});
