const { distance, random_position, normalize_direction } = require('./spatial.js');

const a = {"position": [0,0,0], "direction": [1,1]}
const b = {"position": [1,1,0], "direction": [1,3]}
const c = {"position": [1,6,0]}
const d = {"position": [1,6,2]}

const topology = {"x_bounds": [0,20], "y_bounds": [0,20], "z_bounds": [0, 20]};

test('manhattan distance tests', () => {
    expect(distance(a, b, "manhattan")).toBe(2)
    expect(distance(a, c, "manhattan")).toBe(7)
    expect(distance(a, d, "manhattan")).toBe(9)
})

test('euclidean distance tests', () => {
    expect(distance(a, b, "euclidean")).toBe(1.4142135623730951)
    expect(distance(a, c, "euclidean")).toBe(6.082762530298219)
    expect(distance(a, d, "euclidean")).toBe(6.4031242374328485)
})

test('euclidean distance squared tests', () => {
    expect(distance(a, b, "euclidean_sq")).toBe(2)
    expect(distance(a, c, "euclidean_sq")).toBe(37)
    expect(distance(a, d, "euclidean_sq")).toBe(41)
})


test('chebyshev distance tests', () => {
    expect(distance(a, b, "chebyshev")).toBe(1)
    expect(distance(a, c, "chebyshev")).toBe(6)
    expect(distance(a, d, "chebyshev")).toBe(6)
})

test('random position', () => {
    expect(
        random_position(
            topology
        )[2]
    ).toBe(0),
    expect(
        random_position(
            topology, true
        )[0]
    ).toBeLessThanOrEqual(20)
})

test('normalize direction of [1,1]', () => {

    expect(normalize_direction(a)).toEqual([0.7071067811865475,0.7071067811865475])
})

test('normalize direction of [1,3]', () => {
    expect(normalize_direction(b)).toEqual([0.31622776601683794,0.9486832980505138])
})
