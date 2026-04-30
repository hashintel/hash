import * as Slider from "./slider";

export const App = () => {
  return (
    <Slider.Root width="sm" defaultValue={[40]}>
      <Slider.Control>
        <Slider.Track>
          <Slider.Range />
        </Slider.Track>
        <Slider.Thumbs />
      </Slider.Control>
    </Slider.Root>
  );
};
