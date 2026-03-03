---
name: ark-ui
description: Headless component library for React. Use when building UI components with @ark-ui/react, implementing accessible form inputs, overlays, navigation patterns, or needing guidance on Ark UI's data attributes, composition (asChild), and state management patterns.
license: AGPL-3.0
metadata:
  triggers:
    type: domain
    enforcement: suggest
    priority: medium
    keywords:
      - ark-ui
      - "@ark-ui/react"
      - headless components
    intent-patterns:
      - "\\b(use|create|build|implement)\\b.*?\\bark[-\\s]?ui\\b"
      - "\\b(checkbox|combobox|dialog|popover|tooltip)\\b.*?\\b(headless|ark)\\b"
---

# Ark UI

Headless component library providing accessible, unstyled React primitives for building custom UI components with full control over styling and behavior.

## Key Patterns

- **Root pattern**: `Slider.Root`, `Slider.Track`, etc.
- **CSS styling**: `[data-scope="slider"][data-part="track"]`
- **State styling**: `[data-state="open"]`, `[data-state="checked"]`
- **Composition**: Use `asChild` to render as custom element while keeping behavior
- **State access**: Use `Component.Context` with render props
- **Programmatic control**: Use hooks like `useAccordion()`

## Core Concepts

| Topic | URL |
| --- | --- |
| Getting Started | https://ark-ui.com/react/docs/overview/getting-started |
| Styling (data attributes) | https://ark-ui.com/react/docs/guides/styling |
| Composition (asChild) | https://ark-ui.com/react/docs/guides/composition |
| Component State | https://ark-ui.com/react/docs/guides/component-state |
| Animation | https://ark-ui.com/react/docs/guides/animation |
| Forms Integration | https://ark-ui.com/react/docs/guides/forms |
| Refs | https://ark-ui.com/react/docs/guides/ref |
| Closed Components | https://ark-ui.com/react/docs/guides/closed-components |

## Components

### Form Inputs

| Component | URL |
| --- | --- |
| Checkbox | https://ark-ui.com/react/docs/components/checkbox |
| Combobox | https://ark-ui.com/react/docs/components/combobox |
| Color Picker | https://ark-ui.com/react/docs/components/color-picker |
| Date Picker | https://ark-ui.com/react/docs/components/date-picker |
| Editable | https://ark-ui.com/react/docs/components/editable |
| Field | https://ark-ui.com/react/docs/components/field |
| Fieldset | https://ark-ui.com/react/docs/components/fieldset |
| File Upload | https://ark-ui.com/react/docs/components/file-upload |
| Listbox | https://ark-ui.com/react/docs/components/listbox |
| Number Input | https://ark-ui.com/react/docs/components/number-input |
| Password Input | https://ark-ui.com/react/docs/components/password-input |
| Pin Input | https://ark-ui.com/react/docs/components/pin-input |
| Radio Group | https://ark-ui.com/react/docs/components/radio-group |
| Select | https://ark-ui.com/react/docs/components/select |
| Signature Pad | https://ark-ui.com/react/docs/components/signature-pad |
| Slider | https://ark-ui.com/react/docs/components/slider |
| Switch | https://ark-ui.com/react/docs/components/switch |
| Tags Input | https://ark-ui.com/react/docs/components/tags-input |

### Overlays and Popups

| Component | URL |
| --- | --- |
| Dialog | https://ark-ui.com/react/docs/components/dialog |
| Floating Panel | https://ark-ui.com/react/docs/components/floating-panel |
| Hover Card | https://ark-ui.com/react/docs/components/hover-card |
| Menu | https://ark-ui.com/react/docs/components/menu |
| Popover | https://ark-ui.com/react/docs/components/popover |
| Toast | https://ark-ui.com/react/docs/components/toast |
| Tooltip | https://ark-ui.com/react/docs/components/tooltip |
| Tour | https://ark-ui.com/react/docs/components/tour |

### Layout and Navigation

| Component | URL |
| --- | --- |
| Accordion | https://ark-ui.com/react/docs/components/accordion |
| Carousel | https://ark-ui.com/react/docs/components/carousel |
| Collapsible | https://ark-ui.com/react/docs/components/collapsible |
| Pagination | https://ark-ui.com/react/docs/components/pagination |
| Scroll Area | https://ark-ui.com/react/docs/components/scroll-area |
| Splitter | https://ark-ui.com/react/docs/components/splitter |
| Steps | https://ark-ui.com/react/docs/components/steps |
| Tabs | https://ark-ui.com/react/docs/components/tabs |
| Tree View | https://ark-ui.com/react/docs/components/tree-view |

### Display and Feedback

| Component | URL |
| --- | --- |
| Avatar | https://ark-ui.com/react/docs/components/avatar |
| Clipboard | https://ark-ui.com/react/docs/components/clipboard |
| Marquee | https://ark-ui.com/react/docs/components/marquee |
| Progress Circular | https://ark-ui.com/react/docs/components/progress-circular |
| Progress Linear | https://ark-ui.com/react/docs/components/progress-linear |
| QR Code | https://ark-ui.com/react/docs/components/qr-code |
| Rating Group | https://ark-ui.com/react/docs/components/rating-group |
| Timer | https://ark-ui.com/react/docs/components/timer |

### Selection and Toggle

| Component | URL |
| --- | --- |
| Angle Slider | https://ark-ui.com/react/docs/components/angle-slider |
| Segment Group | https://ark-ui.com/react/docs/components/segment-group |
| Toggle | https://ark-ui.com/react/docs/components/toggle |
| Toggle Group | https://ark-ui.com/react/docs/components/toggle-group |

## Collections

| Collection | URL |
| --- | --- |
| Async List | https://ark-ui.com/react/docs/collections/async-list |
| List Collection | https://ark-ui.com/react/docs/collections/list-collection |
| List Selection | https://ark-ui.com/react/docs/collections/list-selection |
| Tree Collection | https://ark-ui.com/react/docs/collections/tree-collection |

## Utilities

| Utility | URL |
| --- | --- |
| Client Only | https://ark-ui.com/react/docs/utilities/client-only |
| Download Trigger | https://ark-ui.com/react/docs/utilities/download-trigger |
| Environment | https://ark-ui.com/react/docs/utilities/environment |
| Focus Trap | https://ark-ui.com/react/docs/utilities/focus-trap |
| Format Byte | https://ark-ui.com/react/docs/utilities/format-byte |
| Format Number | https://ark-ui.com/react/docs/utilities/format-number |
| Format Relative Time | https://ark-ui.com/react/docs/utilities/format-relative-time |
| Frame | https://ark-ui.com/react/docs/utilities/frame |
| Highlight | https://ark-ui.com/react/docs/utilities/highlight |
| JSON Tree View | https://ark-ui.com/react/docs/utilities/json-tree-view |
| Locale | https://ark-ui.com/react/docs/utilities/locale |
| Presence | https://ark-ui.com/react/docs/utilities/presence |
