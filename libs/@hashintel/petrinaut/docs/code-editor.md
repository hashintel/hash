# Code Editor

Edit a model’s functions in the Properties Panel or expand a code field to full screen.

## Open code

Select a place, transition, or differential equation in the canvas or left sidebar. Expand its code section in the Properties Panel, then use **Full screen** above the code to enlarge it.

The code section’s **More options** menu also offers **Open in full screen** and **Open in properties panel**. The Properties Panel keeps the selected item’s fields and controls alongside its code. Drag the panel’s left edge or the divider between sections to resize it.

The item’s menu in the left sidebar opens its code directly. For a place with dynamics, **Open equation code** beside its assigned differential equation opens that equation.

## Full-screen editing

Full screen replaces the canvas with code and leaves the left sidebar available. The header shows the item’s kind and name. Open the name menu to jump to another function in the active net. Use the function buttons below the name to switch between a transition’s firing function and kernel.

Use **Back to properties** or **Close code editor** to return to the same code section in the Properties Panel. Code, undo history, cursor position, diagnostics, and the section’s saved height carry over. Full-screen code shows line numbers, wrapped lines, and a minimap.

Changes apply automatically to the model. Read-only files and simulation modes keep code read-only. Changing the file or active subnet closes the editor and resets its code undo history. Code opens in the Properties Panel the next time.

Review layouts keep the code navigation actions available and hide template-loading and visualizer enablement controls.
