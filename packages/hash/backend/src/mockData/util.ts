export const randomTimes = () => {
  const time = new Date(new Date().valueOf() - Math.random() * 100_00_000);

  return {
    createdAt: time,
    updatedAt: time,
  };
};
