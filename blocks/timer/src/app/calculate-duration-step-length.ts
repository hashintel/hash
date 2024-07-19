export const calculateDurationStepLength = (durationInMs: number): number => {
  if (durationInMs <= 10_000) {
    return 1000;
  } if (durationInMs <= 60_000) {
    return 5000;
  } if (durationInMs <= 300_000) {
    return 10000;
  } if (durationInMs <= 600_000) {
    return 30000;
  } if (durationInMs <= 1800_000) {
    return 60000;
  }
 
    return 300000;
  
};
