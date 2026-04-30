import * as RatingGroup from "./rating-group";

export const App = () => {
  return (
    <RatingGroup.Root readOnly count={5} defaultValue={3}>
      <RatingGroup.HiddenInput />
      <RatingGroup.Control />
    </RatingGroup.Root>
  );
};
