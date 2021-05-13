import { random, setSeed } from "./rand";

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
