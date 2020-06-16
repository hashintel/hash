const { on_position, in_radius, front, behind } = require('./neighbors.js');

const a = {"position": [1,1,0], "direction": [1, 0, 0]};
const b = {"position": [1,2,0], "direction": [1, 1, 0]};
const c = {"position": [-1,1,0], "direction": [1, 0, 0]};
const d = {"position": [1,1,0], "direction": [1, -1, 0]};
const e = {"position": [1,1,1], "direction": [1, 0, 0]};
const f = {"position": [3,2,0], "direction": [1, 0, 1]};
const g = {"position": [6,6,-1], "direction": [1, 0, 0]};
const h = {"position": [6,9,0], "direction": [1, 0, 1]};
const i = {"position": [4,9,0], "direction": [1, 1, 1]};
const j = {"position": [3,2,2], "direction": [1, 0, -1]};

test('find neighbors with same position', () => {
  expect(on_position(a, [b, c, d, e, f])).toEqual([{"position": [1,1,0], "direction": [1, -1, 0]}])
})

test('find neighbors within a radius of 3', () => {
  expect(in_radius(g, [a, b, c, d, e, f, h, i], 3)).toEqual([{"position": [6,9,0], "direction": [1, 0, 1]}, {"position": [4,9,0], "direction": [1, 1, 1]}])
})

test('find neighbors within a max radius of 4 and min radius of 3', () => {
  expect(in_radius(g, [a, b, c, d, e, f, h, i, j], 4, 3)).toEqual([{"position": [3,2,0], "direction": [1, 0, 1]}, {"position": [3,2,2], "direction": [1, 0, -1]}]),
  expect(in_radius(g, [a, b, c, d, e, f, h, i, j], 4, 3, true)).toEqual([{"position": [3,2,2], "direction": [1, 0, -1]}])
})

test('find neighbors in front of agent with postion [1, 2, 0] and direction [1, 1, 0]', () => {
  expect(front(b, [a, c, e, g, h, j])).toEqual([{"position": [6,6,-1], "direction": [1, 0, 0]}, {"position": [6,9,0], "direction": [1, 0, 1]}, {"position": [3,2,2], "direction": [1, 0, -1]}])
})

test('find neighbors located behind [3,2] agent with postion [1, 2, 0] and direction [1, 1, 0]', () => {
  expect(behind(b, [a, e, g, h, j])).toEqual([{"position": [1,1,0], "direction": [1, 0, 0]}, {"position": [1,1,1], "direction": [1, 0, 0]}])
})
