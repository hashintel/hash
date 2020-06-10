const { on_position, in_radius, in_front } = require('./neighbors.js');

const a = {"position": [1,1,0]}
const b = {"position": [1,2,0]}
const c = {"position": [-1,1,0]}
const d = {"position": [1,1,0]}
const e = {"position": [1,1,1]}
const f = {"position": [3,2,0]}
const g = {"position": [6,7,0]}
const h = {"position": [6,9,0]}
const i = {"position": [4,9,0]}
const j = {"position": [3,2,0]}

test('find neighbors with same position', () => {
  expect(on_position(a, [b, c, d, e, f])).toEqual([{"position": [1,1,0]}])
})

test('find neighbors within a radius of 2', () => {
  expect(in_radius(g, [a, b, c, d, e, f, h, i], 2)).toEqual([{"position": [6,9,0]}, {"position": [4,9,0]}])
})

test('find neighbors in front of [3,2]', () => {
  expect(in_front(f, [a, b, c, e, g, h, i, j])).toEqual([{"position": [6,7,0]}, {"position": [6,9,0]}, {"position": [4,9,0]}])
})
