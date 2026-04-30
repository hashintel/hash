import * as RatingGroup from "./rating-group";

export const App = () => {
  return (
    <RatingGroup.Root allowHalf count={5} defaultValue={3.5}>
      <RatingGroup.HiddenInput />
      <RatingGroup.Control />
    </RatingGroup.Root>
  );
};
