@hashintel/refractive
=======================

## Install

```sh
npm install @hashintel/refractive
```

## Usage

`refractive` is a higher-order component (HOC) that can wrap any React component to apply refractive glass effects.
The `refraction` prop allows you to customize the appearance of the effect.

The HOC uses SVG filters to create the refractive effect, which is applied via the `backdrop-filter` CSS property.

> Caution: `refractive` will override `style.backdropFilter` and `style.borderRadius` of the wrapped component.

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
</RefractiveButton>
```
