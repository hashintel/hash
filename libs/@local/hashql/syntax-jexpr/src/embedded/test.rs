use core::fmt::Debug;

use hashql_core::{
    heap::Heap,
    span::{SpanAncestors, SpanTable, TextRange},
};
use hashql_diagnostics::source::SourceId;
use text_size::TextSize;
use winnow::{LocatingSlice, Parser as _, Stateful, error::ContextError};

use crate::{ParserOptions, embedded::context::Context, lexer::RawOffsets, span::Span};

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
#[repr(u32)]
pub(crate) enum ResultKind {
    Ok,
    Err,
}

impl ResultKind {
    fn into_content(self) -> insta::internals::Content {
        insta::internals::Content::UnitVariant(
            "ResultKind",
            self as u32,
            match self {
                Self::Ok => "Ok",
                Self::Err => "Err",
            },
        )
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) struct Info {
    kind: ResultKind,
}

impl Info {
    pub(crate) fn into_content(self) -> insta::internals::Content {
        insta::internals::Content::Struct("Info", vec![("kind", self.kind.into_content())])
    }
}

macro format_result {
    (Debug; $ident:ident) => {
        format!("{:#?}", $ident)
    },
    (SyntaxDump; $ident:ident) => {
        hashql_ast::format::SyntaxDump::syntax_dump_to_string(&$ident)
    }
}

pub(crate) macro bind_parser($format:ident; fn $name:ident($parser:ident)) {
    // macro avoids generic lifetime plumbing across the parser callback
    fn $name(source: &str) -> (String, Info) {
        let heap = Heap::new();
        let mut spans = SpanTable::new(SourceId::new_unchecked(0x00));
        let parent = spans.insert(Span::new(TextRange::up_to(TextSize::of(source))), SpanAncestors::EMPTY);

        let context = Context {
            heap: &heap,
            spans: &mut spans,
            parent,
            offsets: RawOffsets::verbatim_in(alloc::alloc::Global),
            depth: 0,
            max_depth: 0,
            options: ParserOptions::default(),
        };

        let input = Stateful {
            input: LocatingSlice::new(source),
            state: context,
        };

        let result = $parser::<ContextError, alloc::alloc::Global>.parse(input);
        match result {
            Ok(ident) => (
                format_result!($format; ident),
                Info {
                    kind: ResultKind::Ok,
                },
            ),
            Err(error) => (
                error.to_string(),
                Info {
                    kind: ResultKind::Err,
                },
            ),
        }
    }
}

pub(crate) macro assert_parse($parser:ident, $source:expr, $description:literal) {{
        let (result, info) = $parser($source);

        ::insta::with_settings!({
            description => $description,
            raw_info => &info.into_content(),
        }, {
            ::insta::assert_snapshot!(insta::_macro_support::AutoName, result, $source);
        })
    }}

pub(crate) macro test_cases($parser:ident;
        $(
            $name:ident($source:expr) => $description:expr,
        )*
    ) {
        $(
            #[test]
            fn $name() {
                assert_parse!($parser, $source, $description);
            }
        )*
    }
