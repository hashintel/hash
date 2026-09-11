# Code Editor

Open a model’s code in a larger editor while keeping its place, transition, or differential equation in view.

## Enable the layouts

Open **Settings** using the canvas gear button. Under **Feature flags**, turn on **Code editor layouts**, or select a layout card:

- **Full screen** replaces the canvas with code. The file’s left sidebar stays available.
- **Properties panel** fills the right-hand panel with code and a compact header. Drag its left edge to resize it.
- **Bottom dock** opens code below the canvas. Drag its top edge to resize it.

Your chosen layout is remembered. Turn the feature off to return to the inline editors.

## Open code directly

Use the **Code** menu on the canvas to choose a transition’s predicate or stochastic rate (λ), its transition kernel, a differential equation, or an enabled place visualizer.

You can also select an item in the canvas or left sidebar, then use the code section’s **More options** menu to open it in a specific layout. This works while the section is collapsed. Inside an expanded code section, **Open code editor** uses your preferred layout.

The item’s menu in the left sidebar opens its code directly. For a place with dynamics, **Open equation code** beside its assigned differential equation opens that equation.

## Navigate and edit

The header shows the item’s kind and name. Open the name menu to jump to another function in the active net. Use the function buttons below the name to switch between a transition’s firing function and kernel.

The **Code editor layout** button switches between layouts. Your code, undo history, cursor position, and diagnostics carry over. Enlarged editors show line numbers and wrap long lines; full screen and the bottom dock also show a code minimap.

Changes apply automatically to the model. Read-only files and simulation modes keep code read-only. Use **Back to properties** or **Close code editor** to return to the canvas and property fields. Changing the file or active subnet closes the editor.
