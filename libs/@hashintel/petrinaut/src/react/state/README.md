---
layer: react.state
role: Publishes the state of an editing session that the document does not hold, and the hooks that read it
---

The state of an editing session is the mode and the selection, the open
panels, the user settings and the panel geometry.

The layer owns the open panels, the user settings and the panel geometry.
The location owns the mode and the selection, and the layer reads them from
[navigation](layer:react.navigation). The document, its undo history and its
active net are in [the document block](layer:react.document), and the
read-only reason is in [the edit guard](layer:react.editing).

[Editor state](doc:react.state/editor-state) has the table of owners and the
rules for reading.
[Panel geometry outside React state](doc:react.state/panel-sizes) has the
rules for the values that change per frame.
