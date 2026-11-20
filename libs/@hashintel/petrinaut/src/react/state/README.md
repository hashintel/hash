---
layer: react.state
role: Owns the state of an editing session, which belongs to neither the document nor a run
---

The state of an editing session is the mode and the selection, the open
panels, the user settings, the panel geometry, the read-only reason, the undo
history and the active net.

Each piece has one owner and one hook that reads it. A reader renders when
the part it reads changes, and a value that changes on every frame is a
Motion value that no component reads in render.

The guide "Editor state" has the table of owners and the rules for reading.
The guide "Panel geometry outside React state" has the rules for the values
that change per frame.
