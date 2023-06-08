The Code block uses a custom code editing component to support syntax highlighting for 15 programming languages (listed below).

An optional caption can be added below the code snippet and a "Copy" button copies the whole code snippet to the clipboard.

## Programmatic Usage

The block stores its state locally in the following properties, ([view the Code Block entity type](https://blockprotocol.org/@hash/types/entity-type/code-block/v/2) to see these in context):

- [`Textual Content`](https://blockprotocol.org/@blockprotocol/types/property-type/textual-content/) (the code snippet)
- [`Code Block Language`](https://blockprotocol.org/@hash/types/property-type/code-block-language/)
- [`Caption`](https://blockprotocol.org/@blockprotocol/types/property-type/caption/)

Whenever the code editing `textarea` is blurred, the caption input is blurred, or the language selection is changed, the Graph Module's `updateEntity` method is called to save the local data to the embedding application.

### Supported language syntax

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
