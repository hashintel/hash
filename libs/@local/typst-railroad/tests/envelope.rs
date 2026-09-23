use railroad_plugin::compile_json;
use serde_json::json;

#[expect(
    clippy::big_endian_bytes,
    reason = "the plugin protocol encodes dimensions in big-endian order"
)]
#[test]
fn compile_json_multiple_roots_envelope() {
    let source = serde_json::to_vec(&json!({
        "styles": { "base": null, "custom": null },
        "diagram": [
            { "Sequence": { "children": [
                "SimpleStart",
                { "Terminal": { "label": "first" } },
                "SimpleEnd"
            ] } },
            { "NonTerminal": { "label": "second" } }
        ]
    }))
    .expect("should encode the diagram");

    let output = compile_json(&source).expect("should compile the node tree");
    let width = i64::from_be_bytes(output[..8].try_into().expect("should contain the width"));
    let height = i64::from_be_bytes(output[8..16].try_into().expect("should contain the height"));
    let svg = core::str::from_utf8(&output[16..]).expect("should contain UTF-8 SVG");

    assert!(width > 0 && height > 0, "should report positive dimensions");
    assert_ne!(width, height, "should distinguish header order");
    assert!(
        svg.contains(&format!("viewBox=\"0 0 {width} {height}\"")),
        "should report the SVG dimensions in width-height order"
    );
    assert!(svg.contains("first</text>"), "should render the first root");
    assert!(
        svg.contains("second</text>"),
        "should render the second root"
    );
    assert!(
        !svg.contains("<style"),
        "should leave inline styling to the page"
    );
}
