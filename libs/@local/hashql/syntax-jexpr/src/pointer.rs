use alloc::{alloc::Global, borrow::Cow, sync::Arc};
use core::{
    alloc::Allocator,
    fmt::{self, Write as _},
    range::Range,
};
use std::sync::OnceLock;

use rowan::{GreenNode, GreenToken};
use text_size::{TextRange, TextSize};

use crate::{
    cst::{self, Token as _},
    lexer::decode_quoted,
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

fn push_key_token(token: &GreenToken, pointer: &mut String) {
    let text = token.text();
    match decode_quoted(text) {
        Ok(Cow::Borrowed(decoded)) => push_segment(pointer, decoded),
        Ok(Cow::Owned(decoded)) => push_segment(pointer, &decoded),
        Err(_) => {
            // Fall back to the raw slice without surrounding quotes when the key had a lex error.
            let stripped = text
                .strip_prefix('"')
                .map_or(text, |rest| rest.strip_suffix('"').unwrap_or(rest));
            push_segment(pointer, stripped);
        }
    }
}

enum Segment {
    None,
    Index(usize),
    Key(GreenToken),
}

struct IndexNode {
    range: TextRange,
    segment: Segment,
    children: Range<usize>,
}

struct PointerIndex<A: Allocator> {
    nodes: Vec<IndexNode, A>,
}

impl<A: Allocator> PointerIndex<A> {
    fn build_in(root: cst::SyntaxNodeData<'_>, alloc: A) -> Self
    where
        A: Clone,
    {
        let mut nodes = Vec::new_in(alloc.clone());
        nodes.push(IndexNode {
            range: root.text_range(),
            segment: Segment::None,
            children: (0..0).into(),
        });

        let mut queue = Vec::new_in(alloc);
        queue.push(root);

        let mut cursor = 0;
        while cursor < queue.len() {
            let current = queue[cursor];
            let counts_elements = current.kind().is_array_container();
            let children_start = nodes.len();
            let mut element_index = 0_usize;

            for child in current.children() {
                let child_kind = child.kind();
                let segment = if counts_elements && child_kind != SyntaxKind::Error {
                    let index = element_index;
                    element_index += 1;
                    Segment::Index(index)
                } else if child_kind.is_object_field() {
                    child
                        .first_token::<cst::StringToken<'_>>()
                        .map_or(Segment::None, |token| {
                            Segment::Key(token.syntax().green().to_owned())
                        })
                } else {
                    Segment::None
                };

                nodes.push(IndexNode {
                    range: child.text_range(),
                    segment,
                    children: (0..0).into(),
                });
                queue.push(child);
            }

            nodes[cursor].children = (children_start..nodes.len()).into();
            cursor += 1;
        }

        Self { nodes }
    }

    fn resolve(&self, range: TextRange) -> Option<JsonPointer> {
        let root = self.nodes.first()?;
        if !root.range.contains_range(range) {
            return None;
        }

        let mut pointer = String::new();
        let mut current = root;

        loop {
            let children = &self.nodes[current.children];
            let index = children.partition_point(|child| child.range.end() < range.end());
            let Some(child) = children.get(index) else {
                break;
            };

            if !child.range.contains_range(range) {
                break;
            }

            match &child.segment {
                Segment::None => {}
                Segment::Index(element_index) => {
                    write!(pointer, "/{element_index}").expect("writing to String is infallible");
                }
                Segment::Key(token) => push_key_token(token, &mut pointer),
            }

            current = child;
        }

        // caching doesn't make sense here, we'd need to allocate a new pointer anyway if a parent
        // already exists, and the cheap work, the traversal, would still need to happen regardless,
        // so we'll just rebuild it. This is optimistic, as spans tends to be associated with
        // diagnostics, in which case the pointer is not going to be requested multiple times.
        Some(JsonPointer(Arc::from(pointer)))
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct JsonPointer(Arc<str>);

impl AsRef<str> for JsonPointer {
    fn as_ref(&self) -> &str {
        &self.0
    }
}

impl fmt::Display for JsonPointer {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::Display::fmt(&self.0, fmt)
    }
}

/// Resolves byte ranges in a J-Expr document to RFC 6901 JSON Pointers.
pub struct JsonPointers {
    tree: GreenNode,
    index: OnceLock<PointerIndex<Global>>,
}

impl JsonPointers {
    pub(crate) const fn from_green(tree: GreenNode) -> Self {
        Self {
            tree,
            index: OnceLock::new(),
        }
    }

    /// Resolves the RFC 6901 JSON Pointer for `range`, or `None` outside the source bounds.
    #[must_use]
    pub fn resolve(&self, range: TextRange) -> Option<JsonPointer> {
        let index = self.index.get_or_init(|| {
            PointerIndex::build_in(
                cst::SyntaxNodeData {
                    data: &self.tree,
                    offset: TextSize::new(0),
                },
                Global,
            )
        });

        index.resolve(range)
    }
}

#[cfg(test)]
mod tests {

    use alloc::alloc::Global;

    use hashql_core::{heap::Heap, span::SpanTable};
    use hashql_diagnostics::source::SourceId;
    use text_size::{TextRange, TextSize};

    use super::JsonPointer;
    use crate::{Parser, ParserOptions};

    fn pointer_at(source: &str, needle: &str) -> Option<JsonPointer> {
        let heap = Heap::new();
        let mut spans = SpanTable::new(SourceId::new_unchecked(0));
        let (_, pointers) = Parser::new(&heap, &mut spans, ParserOptions::default())
            .parse_expr_with_pointers_in(source, Global);
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
        assert_eq!(
            pointer_at(source, source).as_ref().map(AsRef::as_ref),
            Some("")
        );
        assert_eq!(
            pointer_at(source, r#"{"items""#)
                .as_ref()
                .map(AsRef::as_ref),
            Some("/#struct")
        );
        assert_eq!(
            pointer_at(source, r#""items""#).as_ref().map(AsRef::as_ref),
            Some("/#struct/items")
        );
        assert_eq!(
            pointer_at(source, r##"{"#literal": 42}"##)
                .as_ref()
                .map(AsRef::as_ref),
            Some("/#struct/items/#list/0")
        );
        assert_eq!(
            pointer_at(source, "42").as_ref().map(AsRef::as_ref),
            Some("/#struct/items/#list/0/#literal")
        );
    }

    #[test]
    fn call_and_labeled_arguments() {
        let source = r##"["greet", "user.name", {":age": {"#literal": 30}}, ":active"]"##;
        assert_eq!(
            pointer_at(source, r#""greet""#).as_ref().map(AsRef::as_ref),
            Some("/0")
        );
        assert_eq!(
            pointer_at(source, "name").as_ref().map(AsRef::as_ref),
            Some("/1")
        );
        assert_eq!(
            pointer_at(source, r#"":age""#).as_ref().map(AsRef::as_ref),
            Some("/2/:age")
        );
        assert_eq!(
            pointer_at(source, "30").as_ref().map(AsRef::as_ref),
            Some("/2/:age/#literal")
        );
        assert_eq!(
            pointer_at(source, r#"":active""#)
                .as_ref()
                .map(AsRef::as_ref),
            Some("/3")
        );
    }

    #[test]
    fn dict_array_and_escaped_keys() {
        let array_dict = r##"{"#dict": [[{"#literal": "k"}, {"#literal": "v"}]]}"##;
        assert_eq!(
            pointer_at(array_dict, r#""k""#).as_ref().map(AsRef::as_ref),
            Some("/#dict/0/0/#literal")
        );
        assert_eq!(
            pointer_at(array_dict, r#""v""#).as_ref().map(AsRef::as_ref),
            Some("/#dict/0/1/#literal")
        );

        let obj_dict = r##"{"#dict": {"a/b~c": {"#literal": 1}}}"##;
        assert_eq!(
            pointer_at(obj_dict, "1").as_ref().map(AsRef::as_ref),
            Some("/#dict/a~1b~0c/#literal")
        );
    }

    #[test]
    fn element_after_invalid_token() {
        // The invalid token is not an element. The elements after it keep their index.
        let source = r##"{"#list": [{"#literal": 1} @, {"#literal": 2}, {"#literal": 3}]}"##;
        assert_eq!(
            pointer_at(source, "2").as_ref().map(AsRef::as_ref),
            Some("/#list/1/#literal")
        );
        assert_eq!(
            pointer_at(source, "3").as_ref().map(AsRef::as_ref),
            Some("/#list/2/#literal")
        );
    }

    #[test]
    fn out_of_bounds_range() {
        let heap = Heap::new();
        let mut spans = SpanTable::new(SourceId::new_unchecked(0));
        let (_, pointers) = Parser::new(&heap, &mut spans, ParserOptions::default())
            .parse_expr_with_pointers_in(r##"{"#literal": 1}"##, Global);
        let range = TextRange::new(TextSize::new(0), TextSize::new(999));
        assert!(pointers.resolve(range).is_none());
    }

    #[test]
    fn boundary_and_empty_ranges() {
        let source = r#"["f", "a", "b"]"#;
        let heap = Heap::new();
        let mut spans = SpanTable::new(SourceId::new_unchecked(0));
        let (_, pointers) = Parser::new(&heap, &mut spans, ParserOptions::default())
            .parse_expr_with_pointers_in(source, Global);

        let a_start = source.find(r#""a""#).expect("needle exists");
        let a_end = a_start + 3;
        let a_start = TextSize::try_from(a_start).expect("start fits in TextSize");
        let a_end = TextSize::try_from(a_end).expect("end fits in TextSize");
        assert_eq!(
            pointers
                .resolve(TextRange::empty(a_start))
                .as_ref()
                .map(AsRef::as_ref),
            Some("/1")
        );
        assert_eq!(
            pointers
                .resolve(TextRange::empty(a_end))
                .as_ref()
                .map(AsRef::as_ref),
            Some("/1")
        );
        // Empty range in whitespace between elements resolves to the enclosing call.
        assert_eq!(
            pointers
                .resolve(TextRange::empty(a_end + TextSize::new(1)))
                .as_ref()
                .map(AsRef::as_ref),
            Some("")
        );
        // Span straddling two siblings resolves to their enclosing call.
        assert_eq!(
            pointers
                .resolve(TextRange::new(a_start, a_end + TextSize::new(4)))
                .as_ref()
                .map(AsRef::as_ref),
            Some("")
        );
    }

    #[test]
    fn wide_array_pointer_resolution() {
        let count = 20_000_usize;
        let mut source = String::with_capacity(6 + count * 4);
        source.push_str(r#"["f""#);
        let mut offsets = Vec::with_capacity(count);
        for _ in 0..count {
            source.push_str(", ");
            let start = source.len();
            source.push_str(r#""""#);
            offsets.push(TextRange::new(
                TextSize::try_from(start).expect("start fits in TextSize"),
                TextSize::try_from(start + 2).expect("end fits in TextSize"),
            ));
        }
        source.push(']');

        let heap = Heap::new();
        let mut spans = SpanTable::new(SourceId::new_unchecked(0));
        let (status, pointers) = Parser::new(&heap, &mut spans, ParserOptions::default())
            .parse_expr_with_pointers_in(&source, Global);
        let failure = status.expect_err("empty string args produce diagnostics");
        assert_eq!(failure.secondary.len() + 1, count);

        for (index, range) in offsets.into_iter().enumerate() {
            assert_eq!(
                pointers.resolve(range).as_ref().map(AsRef::as_ref),
                Some(format!("/{}", index + 1).as_str())
            );
        }
    }
}
