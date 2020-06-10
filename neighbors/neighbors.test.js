const { on_position, in_radius } = require('./neighbors.js');

const a = {"position": [1,1]}
const b = {"position": [1,2]}
const c = {"position": [-1,1]}
const d = {"position": [1,1]}
const e = {"position": [1,1]}
const f = {"position": [3,2]}
const g = {"position": [6,7]}
const h = {"position": [6,9]}
const i = {"position": [4,9]}

test('find neighbors with same position', () => {
  expect(on_position(a, [b, c, d, e, f])).toEqual([{"position": [1,1]}, {"position": [1,1]}])
})

test('find neighbors within a radius of 2', () => {
  expect(in_radius(g, [a, b, c, d, e, f, h, i], 2)).toEqual([{"position": [6,9]}, {"position": [4,9]}])
})
