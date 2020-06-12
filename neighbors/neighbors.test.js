const { on_position, in_radius, front, behind, above, below, right, left } = require('./neighbors.js');

const a = {"position": [1,1,0]};
const b = {"position": [1,2,0]};
const c = {"position": [-1,1,0]};
const d = {"position": [1,1,0]};
const e = {"position": [1,1,1]};
const f = {"position": [3,2,0]};
const g = {"position": [6,7,-1]};
const h = {"position": [6,9,0]};
const i = {"position": [4,9,0]};
const j = {"position": [3,2,0]};

test('find neighbors with same position', () => {
  expect(on_position(a, [b, c, d, e, f])).toEqual([{"position": [1,1,0]}])
})

test('find neighbors within a radius of 2', () => {
  expect(in_radius(g, [a, b, c, d, e, f, h, i], 2)).toEqual([{"position": [6,9,0]}, {"position": [4,9,0]}])
})

test('find neighbors in front of [3,2]', () => {
  expect(front(f, [a, b, c, e, g, h, i, j])).toEqual([{"position": [6,7,-1]}, {"position": [6,9,0]}, {"position": [4,9,0]}])
})

test('find neighbors located behind [3,2]', () => {
  expect(behind(f, [a, b, c, d, e, g, h, i, j])).toEqual([{"position": [1,1,0]}, {"position": [-1,1,0]}, {"position": [1,1,0]}, {"position": [1,1,1]}])
})

test('find neighbors located above [3,2,0]', () => {
  expect(above(f, [a, b, c, d, e, g, h, i, j])).toEqual([{"position": [1,1,1]}])
})

test('find neighbors located below [3,2,0]', () => {
  expect(below(f, [a, b, c, d, e, g, h, i, j])).toEqual([{"position": [6,7,-1]}])
})

test('find neighbors located to the right of [3,2,0]', () => {
  expect(right(f, [a, b, c, d, e, g, h, i, j])).toEqual([{"position": [6,7,-1]}, {"position": [6,9,0]}, {"position": [4,9,0]}])
})

test('find neighbors located to the left of [3,2,0]', () => {
  expect(left(f, [a, b, c, d, e, g, h, i, j])).toEqual([{"position": [1,1,0]},{"position": [1,2,0]}, {"position": [-1,1,0]}, {"position": [1,1,0]}, {"position": [1,1,1]}])
})
