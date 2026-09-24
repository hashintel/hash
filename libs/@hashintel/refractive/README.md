# @hashintel/refractive

## Install

```sh
npm install @hashintel/refractive
```

## Usage

`refractive` is a higher-order component (HOC) that can wrap any React component to apply refractive glass effects.
The `refraction` prop allows you to customize the appearance of the effect.

The HOC uses SVG backdrop filters for glass distortion on Chromium browsers. The `blur` setting uses native CSS backdrop blur in every browser, including Firefox and Safari, which receive blur without the SVG effect. Browsers without SVG refraction skip filter generation and resize observation.

> Caution: `refractive` will override `style.backdropFilter`, `style.WebkitBackdropFilter`, and `style.borderRadius` of the wrapped component.

### Example

```tsx
import { refractive } from "@hashintel/refractive";

<refractive.div
  className="your-class-name"
  refraction={{
    radius: 12,
    blur: 4,
    bezelWidth: 10,
  }}
>
```

### Custom component

```tsx
import { refractive } from "@hashintel/refractive";

const RefractiveButton = refractive(Button);

<RefractiveButton
  onClick={() => {}} // your button props
  refraction={{
    radius: 8,
    blur: 2,
    bezelWidth: 8,
  }}
>
  Click Me
</RefractiveButton>;
```
