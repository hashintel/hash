use core::fmt::Debug;

use hashql_core::{
    heap::Heap,
    span::{SpanTable, TextRange},
};
use text_size::TextSize;
use winnow::{LocatingSlice, Parser as _, Stateful, error::ContextError};

use crate::{parser::string::context::Context, span::Span};

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
    // this could also be a function, but then you run into issues with lifetimes, so this is easier
    fn $name(source: &str) -> (String, Info) {
        let heap = Heap::new();
        let spans = SpanTable::new();
        let parent = spans.insert(Span {
            range: TextRange::up_to(TextSize::of(source)),
            pointer: None,
            parent_id: None,
        });

        let context = Context {
            heap: &heap,
            spans: &spans,
            parent,
        };

        let input = Stateful {
            input: LocatingSlice::new(source),
            state: context,
        };

        let result = $parser::<ContextError>.parse(input);
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
