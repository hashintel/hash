---
layer: react.state
role: Publishes the state of an editing session that the document does not hold, and the hooks that read it
---

The state of an editing session is the mode and the selection, the open
panels, the user settings, the panel geometry, the read-only reason, the undo
history and the active net.

The layer owns the open panels, the user settings and the panel geometry.
The location owns the mode and the selection, and the Core handle owns the
undo history.

[Editor state](doc:react.state/editor-state) has the table of owners and the
rules for reading.
[Panel geometry outside React state](doc:react.state/panel-sizes) has the
rules for the values that change per frame.
