//! On-demand RFC 6901 JSON Pointer derivation from a J-Expr syntax tree.

use alloc::borrow::Cow;

use jsonptr::PointerBuf;
use text_size::TextRange;

use crate::{
    cst::{self, Token as _},
    syntax_kind::SyntaxKind,
};

fn push_first_field_key(node: cst::SyntaxNode<'_>, pointer: &mut PointerBuf) {
    let Some(token) = node.first_token::<cst::StringToken<'_>>() else {
        return;
    };

    match token.decode() {
        Ok(Cow::Borrowed(decoded)) => pointer.push_back(decoded),
        Ok(Cow::Owned(decoded)) => pointer.push_back(decoded.as_str()),
        Err(_) => {
            // Fall back to the raw slice without surrounding quotes when the key had a lex error.
            let text = token.text();
            let stripped = text
                .strip_prefix('"')
                .map_or(text, |rest| rest.strip_suffix('"').unwrap_or(rest));
            pointer.push_back(stripped);
        }
    }
}

/// Derives the RFC 6901 [`PointerBuf`] for `range` by descending from `root`.
///
/// Returns `None` if `range` lies outside `root`'s byte bounds.
#[must_use]
pub(crate) fn json_pointer_for_range(
    root: cst::SyntaxNode<'_>,
    range: TextRange,
) -> Option<PointerBuf> {
    if !root.text_range().contains_range(range) {
        return None;
    }

    let mut pointer = PointerBuf::new();
    let mut current = root;

    loop {
        let counts_elements = current.kind().is_array_container();
        let mut element_index = 0_usize;
        let mut next_child = None;

        for child in current.children() {
            let child_kind = child.kind();
            let is_element = counts_elements && child_kind != SyntaxKind::Error;

            if child.text_range().contains_range(range) {
                if is_element {
                    pointer.push_back(element_index);
                } else if child_kind.is_object_field() {
                    push_first_field_key(child, &mut pointer);
                } else {
                    // Wrapper and error nodes add no pointer segment.
                }
                next_child = Some(child);
                break;
            }

            if is_element {
                element_index += 1;
            }
        }

        match next_child {
            Some(child) => current = child,
            None => break,
        }
    }

    Some(pointer)
}

#[cfg(test)]
mod tests {
    use text_size::{TextRange, TextSize};

    use crate::Parser;

    fn pointer_at(source: &str, needle: &str) -> Option<String> {
        let parse = Parser::parse_expr_cst(source);
        let start = source.find(needle).expect("needle must exist in source");
        let range = TextRange::new(
            TextSize::try_from(start).expect("start fits in TextSize"),
            TextSize::try_from(start + needle.len()).expect("end fits in TextSize"),
        );
        parse
            .json_pointer(range)
            .map(|pointer| pointer.as_str().to_owned())
    }

    #[test]
    fn root_and_nested_constructors() {
        let source = r##"{"#struct": {"items": {"#list": [{"#literal": 42}]}}}"##;
        assert_eq!(pointer_at(source, source).as_deref(), Some(""));
        assert_eq!(
            pointer_at(source, r#"{"items""#).as_deref(),
            Some("/#struct")
        );
        assert_eq!(
            pointer_at(source, r#""items""#).as_deref(),
            Some("/#struct/items")
        );
        assert_eq!(
            pointer_at(source, r##"{"#literal": 42}"##).as_deref(),
            Some("/#struct/items/#list/0")
        );
        assert_eq!(
            pointer_at(source, "42").as_deref(),
            Some("/#struct/items/#list/0/#literal")
        );
    }

    #[test]
    fn call_and_labeled_arguments() {
        let source = r##"["greet", "user.name", {":age": {"#literal": 30}}, ":active"]"##;
        assert_eq!(pointer_at(source, r#""greet""#).as_deref(), Some("/0"));
        assert_eq!(pointer_at(source, "name").as_deref(), Some("/1"));
        assert_eq!(pointer_at(source, r#"":age""#).as_deref(), Some("/2/:age"));
        assert_eq!(
            pointer_at(source, "30").as_deref(),
            Some("/2/:age/#literal")
        );
        assert_eq!(pointer_at(source, r#"":active""#).as_deref(), Some("/3"));
    }

    #[test]
    fn dict_array_and_escaped_keys() {
        let array_dict = r##"{"#dict": [[{"#literal": "k"}, {"#literal": "v"}]]}"##;
        assert_eq!(
            pointer_at(array_dict, r#""k""#).as_deref(),
            Some("/#dict/0/0/#literal")
        );
        assert_eq!(
            pointer_at(array_dict, r#""v""#).as_deref(),
            Some("/#dict/0/1/#literal")
        );

        let obj_dict = r##"{"#dict": {"a/b~c": {"#literal": 1}}}"##;
        assert_eq!(
            pointer_at(obj_dict, "1").as_deref(),
            Some("/#dict/a~1b~0c/#literal")
        );
    }

    #[test]
    fn out_of_bounds_range_returns_none() {
        let parse = Parser::parse_expr_cst(r##"{"#literal": 1}"##);
        let range = TextRange::new(TextSize::new(0), TextSize::new(999));
        assert!(parse.json_pointer(range).is_none());
    }
}
