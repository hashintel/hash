use alloc::borrow::Cow;
use core::fmt::Write as _;

use rowan::GreenNode;
use text_size::{TextRange, TextSize};

use crate::{
    cst::{self, Token as _},
    syntax_kind::SyntaxKind,
};

fn push_segment(pointer: &mut String, segment: &str) {
    pointer.push('/');
    if memchr::memchr2(b'~', b'/', segment.as_bytes()).is_none() {
        pointer.push_str(segment);
        return;
    }

    for character in segment.chars() {
        match character {
            '~' => pointer.push_str("~0"),
            '/' => pointer.push_str("~1"),
            other => pointer.push(other),
        }
    }
}

fn push_first_field_key(node: cst::SyntaxNodeData<'_>, pointer: &mut String) {
    let Some(token) = node.first_token::<cst::StringToken<'_>>() else {
        return;
    };

    match token.decode() {
        Ok(Cow::Borrowed(decoded)) => push_segment(pointer, decoded),
        Ok(Cow::Owned(decoded)) => push_segment(pointer, &decoded),
        Err(_) => {
            // Fall back to the raw slice without surrounding quotes when the key had a lex error.
            let text = token.text();
            let stripped = text
                .strip_prefix('"')
                .map_or(text, |rest| rest.strip_suffix('"').unwrap_or(rest));
            push_segment(pointer, stripped);
        }
    }
}

fn json_pointer_for_range(root: cst::SyntaxNodeData<'_>, range: TextRange) -> Option<String> {
    if !root.text_range().contains_range(range) {
        return None;
    }

    let mut pointer = String::new();
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
                    write!(pointer, "/{element_index}").expect("writing to String is infallible");
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

/// Resolves byte ranges in a J-Expr document to RFC 6901 JSON Pointers.
pub struct JsonPointers {
    tree: GreenNode,
}

impl JsonPointers {
    pub(crate) const fn from_green(tree: GreenNode) -> Self {
        Self { tree }
    }

    /// Resolves the RFC 6901 JSON Pointer for `range`, or `None` outside the source bounds.
    #[must_use]
    pub fn resolve(&self, range: TextRange) -> Option<String> {
        json_pointer_for_range(
            cst::SyntaxNodeData {
                data: &self.tree,
                offset: TextSize::new(0),
            },
            range,
        )
    }
}

#[cfg(test)]
mod tests {
    use hashql_core::{heap::Heap, span::SpanTable};
    use hashql_diagnostics::source::SourceId;
    use text_size::{TextRange, TextSize};

    use crate::Parser;

    fn pointer_at(source: &str, needle: &str) -> Option<String> {
        let heap = Heap::new();
        let mut spans = SpanTable::new(SourceId::new_unchecked(0));
        let (_, pointers) = Parser::new(&heap, &mut spans).parse_expr_with_pointers(source);
        let start = source.find(needle).expect("needle must exist in source");
        let range = TextRange::new(
            TextSize::try_from(start).expect("start fits in TextSize"),
            TextSize::try_from(start + needle.len()).expect("end fits in TextSize"),
        );
        pointers.resolve(range)
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
    fn element_after_invalid_token() {
        // The invalid token is not an element. The elements after it keep their index.
        let source = r##"{"#list": [{"#literal": 1} @, {"#literal": 2}, {"#literal": 3}]}"##;
        assert_eq!(
            pointer_at(source, "2").as_deref(),
            Some("/#list/1/#literal")
        );
        assert_eq!(
            pointer_at(source, "3").as_deref(),
            Some("/#list/2/#literal")
        );
    }

    #[test]
    fn out_of_bounds_range() {
        let heap = Heap::new();
        let mut spans = SpanTable::new(SourceId::new_unchecked(0));
        let (_, pointers) =
            Parser::new(&heap, &mut spans).parse_expr_with_pointers(r##"{"#literal": 1}"##);
        let range = TextRange::new(TextSize::new(0), TextSize::new(999));
        assert!(pointers.resolve(range).is_none());
    }
}
