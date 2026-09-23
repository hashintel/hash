//! Typst WebAssembly plugin for laying out syntax diagrams as SVG.
//!
//! [`compile_json`] accepts structured nodes and returns dimensions followed by SVG text. SVG
//! output keeps labels as text and leaves font resolution to the viewer.

extern crate alloc;

use railroad::Node as _;

mod schema;

#[cfg(target_arch = "wasm32")]
wasm_minimal_protocol::initiate_protocol!();

/// Compiles a JSON node tree into a dimensioned SVG document.
///
/// The result contains a big-endian [`i64`] width, a big-endian [`i64`] height, then UTF-8 SVG
/// bytes. `styles` selects an optional `Light` or `Dark` base stylesheet and optional custom CSS.
/// With both fields set to `null`, the SVG contains no stylesheet. Multiple root nodes form a
/// vertical grid.
///
/// # Errors
///
/// Returns [`serde_json::Error`] if `source` is not valid JSON or does not match the node schema.
///
/// # Example
///
/// ```
/// let source = br#"{
///     "styles": { "base": null, "custom": null },
///     "diagram": [{ "Terminal": { "label": "let" } }]
/// }"#;
/// let output = railroad_plugin::compile_json(source)?;
/// assert!(output[16..].starts_with(b"<svg"));
/// # Ok::<(), serde_json::Error>(())
/// ```
#[expect(
    clippy::big_endian_bytes,
    reason = "the plugin protocol encodes dimensions in big-endian order"
)]
#[cfg_attr(target_arch = "wasm32", wasm_minimal_protocol::wasm_func)]
pub fn compile_json(source: &[u8]) -> Result<Vec<u8>, serde_json::Error> {
    let diagram: schema::Diagram = serde_json::from_slice(source)?;
    let diagram = diagram.render();

    let mut output = Vec::new();
    output.extend_from_slice(&diagram.width().to_be_bytes());
    output.extend_from_slice(&diagram.height().to_be_bytes());
    output.extend_from_slice(diagram.to_string().as_bytes());
    Ok(output)
}
