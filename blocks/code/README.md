The Code block uses a custom code editing component to support syntax highlighting for 15 programming languages (listed below).

An optional caption can be added below the code snippet and a "Copy" button copies the whole code snippet to the clipboard.

The block stores its state locally in [`https://blockprotocol.org/@blockprotocol/types/property-type/textual-content/"](https://blockprotocol.org/@blockprotocol/types/property-type/textual-content/) (the code snippet), [`https://blockprotocol.org/@hash/types/property-type/code-block-language/`](https://blockprotocol.org/@hash/types/property-type/code-block-language/), and [`https://blockprotocol.org/@blockprotocol/types/property-type/caption/`](https://blockprotocol.org/@blockprotocol/types/property-type/caption/) properties.

Whenever the code editing textarea is blurred, or the caption input is blurred, or the language selection is changed, the Graph Module's updateEntity method is called to save the local data to the embedding application.

###### Supported programming languages

- C#
- CSS
- Dart
- Erlang
- Go
- Haml
- Java
- JavaScript
- JSON
- React JSX
- Markup
- Python
- Ruby
- Rust
- TypeScript
