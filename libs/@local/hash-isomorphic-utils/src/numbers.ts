const greatestCommonDivisor = (
  numerator: number,
  denominator: number,
): number => {
  while (denominator !== 0) {
    const temp = denominator;
    // eslint-disable-next-line no-param-reassign
    denominator = numerator % denominator;
    // eslint-disable-next-line no-param-reassign
    numerator = temp;
  }
  return numerator;
};

const scaleValue = (value: number, scale: number) => {
  return Math.round(value * scale);
};

const maxDivisionPrecision = 16;

export const divide = (numerator: number, denominator: number): number => {
  if (Number.isNaN(numerator) || Number.isNaN(denominator)) {
    throw new Error(
      `Arguments cannot be NaN, got numerator: ${numerator}, denominator: ${denominator}`,
    );
  }

  if (denominator === 0) {
    return 0;
  }

  const commonDivisor = greatestCommonDivisor(numerator, denominator);
  const simplifiedNumerator = numerator / commonDivisor;
  const simplifiedDenominator = denominator / commonDivisor;

  const result = simplifiedNumerator / simplifiedDenominator;

  const scale = 10 ** maxDivisionPrecision;
  const truncatedResult = scaleValue(result, scale) / scale;

  return truncatedResult;
};

const countDecimals = (number: number) => {
  if (Math.floor(number) === number) {
    return 0;
  }
  return number.toString().split(".")[1]?.length ?? 0;
};

export const add = (a: number, b: number) => {
  const precisionA = countDecimals(a);
  const precisionB = countDecimals(b);

  const maxPrecision = Math.max(precisionA, precisionB);

  const scale = 10 ** maxPrecision;

  return (scaleValue(a, scale) + scaleValue(b, scale)) / scale;
};

export const subtract = (a: number, b: number) => {
  const precisionA = countDecimals(a);
  const precisionB = countDecimals(b);

  const maxPrecision = Math.max(precisionA, precisionB);

  const scale = 10 ** maxPrecision;

  return (scaleValue(a, scale) - scaleValue(b, scale)) / scale;
};

export const multiply = (a: number, b: number) => {
  const precisionA = countDecimals(a);
  const precisionB = countDecimals(b);

  const totalPrecision = precisionA + precisionB;

  const scale = 10 ** totalPrecision;

  return scaleValue(a * b, scale) / scale;
};
