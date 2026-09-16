# Code Editor

Edit model functions in the Properties Panel. Expand a code section to fill the panel while keeping its controls available.

## Open code

Select a place, transition, or differential equation in the canvas or left sidebar. Open its code section in the Properties Panel:

- **Firing Time** contains a transition’s predicate or stochastic rate.
- **Transition Results** contains a transition’s output function.
- **Differential Equation** contains the equation’s properties and code.
- **Visualizer** contains a place’s visualization code and preview.

The item’s menu in the left sidebar opens its code directly. For a place with dynamics, **Open equation code** beside its assigned differential equation opens that equation.

## Fill the panel

Use the **Fill panel** button in the section header to expand that section to the full width and height of the Properties Panel’s section area. Its controls stay beside the code. The canvas and the panel’s width stay unchanged.

The expanded header shows a breadcrumb, such as **Transition Collision › Transition Results**, using the parent’s usual icon and title. Long parent names fade so the code section’s name stays visible. Click the parent name to return to the item’s other properties. Code, undo history, cursor position, and the other sections’ sizes and contents remain in place.

Expanding and returning animate within the section container. These transitions respect the animation setting and your system’s reduced-motion preference.

On hosts with app navigation enabled, expanding a section updates the URL and browser history. **Back** closes the expanded view and **Forward** reopens it. Reloading or opening that URL restores the selected item and expanded section.

Returning restores keyboard focus to **Fill panel**, or to the section header if the section was collapsed before opening the link. The section keeps its saved collapsed state.

Drag the panel’s left edge to change its width. After returning to the other properties, drag the dividers between sections to change their heights.

Changes apply automatically to the model. Read-only files and simulation modes keep code read-only. Selecting another item or changing the file or active subnet restores the usual section layout.
