const { distance, random_position } = require('./spatial.js');

const a = {"position": [0,0]}
const b = {"position": [1,1]}
const c = {"position": [1,6]}

test('manhattan distance tests', () => {
    expect(distance(a, b, "manhattan")).toBe(2)
    expect(distance(a, c, "manhattan")).toBe(7)
})

test('euclidean distance tests', () => {
    expect(distance(a, b, "euclidean")).toBe(1.4142135623730951)
    expect(distance(a, c, "euclidean")).toBe(6.082762530298219)
})

test('euclidean distance squared tests', () => {
    expect(distance(a, b, "euclidean_sq")).toBe(2)
    expect(distance(a, c, "euclidean_sq")).toBe(37)
})


test('chebyshev distance tests', () => {
    expect(distance(a, b, "chebyshev")).toBe(1)
    expect(distance(a, c, "chebyshev")).toBe(6)
})

test('random position', () => {
    expect(
        random_position(
            {"x_bounds": [0,20], "y_bounds": [0,20]}
        )[0]
    ).toBeLessThanOrEqual(20)
})