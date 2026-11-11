/**
 * A system `x' = A x + b`: `matrix` is `A`, row-major `dimension × dimension`,
 * and `offset` is `b`.
 */
export type AffineSystem = {
  dimension: number;
  matrix: Float64Array;
  offset: Float64Array;
};

const identity = (size: number): Float64Array => {
  const result = new Float64Array(size * size);
  for (let index = 0; index < size; index++) {
    result[index * size + index] = 1;
  }
  return result;
};

const multiply = (
  left: Float64Array,
  right: Float64Array,
  size: number,
): Float64Array => {
  const product = new Float64Array(size * size);
  for (let row = 0; row < size; row++) {
    for (let inner = 0; inner < size; inner++) {
      const factor = left[row * size + inner]!;
      if (factor === 0) {
        continue;
      }
      for (let column = 0; column < size; column++) {
        product[row * size + column] =
          product[row * size + column]! +
          factor * right[inner * size + column]!;
      }
    }
  }
  return product;
};

/** Largest absolute column sum, the matrix 1-norm. */
const norm1 = (matrix: Float64Array, size: number): number => {
  let largest = 0;
  for (let column = 0; column < size; column++) {
    let sum = 0;
    for (let row = 0; row < size; row++) {
      sum += Math.abs(matrix[row * size + column]!);
    }
    largest = Math.max(largest, sum);
  }
  return largest;
};

/**
 * `e^M` for a square row-major matrix, by scaling and squaring around a
 * Taylor series. The series runs until its terms vanish in double precision,
 * which a scaled norm of at most one half reaches within thirty terms, so
 * the result is exact to rounding for the small matrices a token's
 * attributes make.
 */
export function matrixExponential(
  matrix: Float64Array,
  size: number,
): Float64Array {
  if (matrix.length !== size * size) {
    throw new Error(
      `A ${size}×${size} matrix has ${size * size} entries, not ${matrix.length}`,
    );
  }
  const norm = norm1(matrix, size);
  if (!Number.isFinite(norm)) {
    // An infinite norm would ask for infinitely many squarings.
    throw new Error("The matrix has an entry that is not finite");
  }
  const squarings =
    norm <= 0.5 ? 0 : Math.max(0, Math.ceil(Math.log2(norm / 0.5)));
  const scale = 2 ** -squarings;
  const scaled = new Float64Array(size * size);
  for (let index = 0; index < scaled.length; index++) {
    scaled[index] = matrix[index]! * scale;
  }

  let result = identity(size);
  let term = identity(size);
  for (let order = 1; order <= 40; order++) {
    term = multiply(term, scaled, size);
    for (let index = 0; index < term.length; index++) {
      term[index] = term[index]! / order;
    }
    let largest = 0;
    for (let index = 0; index < term.length; index++) {
      result[index] = result[index]! + term[index]!;
      largest = Math.max(largest, Math.abs(term[index]!));
    }
    if (largest < 1e-18) {
      break;
    }
  }
  for (let count = 0; count < squarings; count++) {
    result = multiply(result, result, size);
  }
  return result;
}

/**
 * The propagator of an affine system over `span`: the exponential of the
 * augmented matrix `[[A, b], [0, 0]]` times `span`, so that `[x(span); 1]`
 * is the propagator applied to `[x(0); 1]`. One propagator serves every
 * token that follows the same system.
 */
export function affinePropagator(
  system: AffineSystem,
  span: number,
): Float64Array {
  const size = system.dimension + 1;
  const augmented = new Float64Array(size * size);
  for (let row = 0; row < system.dimension; row++) {
    for (let column = 0; column < system.dimension; column++) {
      augmented[row * size + column] =
        system.matrix[row * system.dimension + column]! * span;
    }
    augmented[row * size + system.dimension] = system.offset[row]! * span;
  }
  return matrixExponential(augmented, size);
}

/**
 * Applies a propagator from `affinePropagator` to the `dimension` values of
 * `state`, in place.
 */
export function applyAffinePropagator(
  propagator: Float64Array,
  dimension: number,
  state: Float64Array,
): void {
  const size = dimension + 1;
  const next = new Float64Array(dimension);
  for (let row = 0; row < dimension; row++) {
    let sum = propagator[row * size + dimension]!;
    for (let column = 0; column < dimension; column++) {
      sum += propagator[row * size + column]! * state[column]!;
    }
    next[row] = sum;
  }
  state.set(next);
}
