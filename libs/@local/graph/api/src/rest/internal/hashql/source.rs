use alloc::{borrow::Cow, collections::BTreeMap};
use core::{fmt, ops::Range};

use hashql_ast::node::{expr::Expr, value::Value};
use hashql_core::{
    heap::{Heap, ScopeAllocator, SymbolAllocator as _},
    span::{SpanId, SpanTable},
    symbol::Symbol,
};
use hashql_diagnostics::{
    IteratorStatusExt as _, Source, Sources, Status, StatusExt as _,
    source::{DiagnosticSpan as _, SourceId},
};
use hashql_syntax_jexpr::{
    JsonPointer, JsonPointers, Parser, ParserOptions, Span, error::JExprDiagnosticCategory,
};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize, de::Error as _};
use serde_json::value::RawValue;

/// The values a request supplies for the inputs of its query, by the name of the input.
///
/// A value is a J-Expr of literals and of the constructors for structs, tuples, lists and dicts.
#[derive(Default, JsonSchema)]
#[schemars(extend("maxProperties" = Self::MAX_LEN))]
pub(crate) struct InputValues(
    #[schemars(with = "BTreeMap<String, hashql_syntax_jexpr::schema::Value>")]
    BTreeMap<String, Box<RawValue>>,
);

impl InputValues {
    // the query and each value are a source of their own. the source with the largest id stays
    // unused, because `SpanId::SYNTHETIC` encodes it.
    const MAX_LEN: usize = SpanId::MAX_SOURCE_ID as usize - 1;
}

impl<'de> Deserialize<'de> for InputValues {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        let values = BTreeMap::deserialize(deserializer)?;

        if values.len() > Self::MAX_LEN {
            return Err(D::Error::custom(format_args!(
                "{} input values, expected at most {}",
                values.len(),
                Self::MAX_LEN
            )));
        }

        Ok(Self(values))
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]

pub(crate) enum ExpressionLocation<'request> {
    Query,
    Input(Cow<'request, str>),
}

impl ExpressionLocation<'_> {
    fn into_owned<'owned>(self) -> ExpressionLocation<'owned> {
        match self {
            ExpressionLocation::Query => ExpressionLocation::Query,
            ExpressionLocation::Input(name) => {
                ExpressionLocation::Input(Cow::Owned(name.into_owned()))
            }
        }
    }
}

impl fmt::Display for ExpressionLocation<'_> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ExpressionLocation::Query => fmt.write_str("query"),
            ExpressionLocation::Input(name) => write!(fmt, "inputs.{name}"),
        }
    }
}

impl Serialize for ExpressionLocation<'_> {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.collect_str(self)
    }
}

#[derive(Debug, PartialEq, Eq, PartialOrd, Ord)]
struct SerializeThroughDisplay<T>(T);

impl<T: fmt::Display> Serialize for SerializeThroughDisplay<T> {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.collect_str(&self.0)
    }
}

#[derive(Debug, Serialize)]
pub(crate) struct PointerSpan {
    location: ExpressionLocation<'static>,
    range: Range<usize>,
    pointer: Option<SerializeThroughDisplay<JsonPointer>>,
}

/// The query of a request and the values of its inputs, as the parser returns them.
pub(crate) struct ParsedRequest<'heap> {
    pub query: Status<Expr<'heap>, JExprDiagnosticCategory, SpanId>,
    pub inputs: Status<Vec<(Symbol<'heap>, Value<'heap>)>, JExprDiagnosticCategory, SpanId>,
}

pub(crate) struct RequestSource<'request> {
    source: SourceId,
    location: ExpressionLocation<'request>,
    pointers: JsonPointers,
}

/// The sources of a request, with the spans and the JSON pointers the parser records for each.
///
/// The query is the first source. The value of each input follows, in the order of the names.
pub(crate) struct RequestSources<'request> {
    sources: Sources<'request>,
    spans: Vec<SpanTable<Span>>,
    origins: Vec<RequestSource<'request>>,
}

impl<'request> RequestSources<'request> {
    fn parse_source<'heap, T>(
        &mut self,
        heap: &'heap Heap,
        location: ExpressionLocation<'request>,
        text: &'request str,
        parse: impl FnOnce(Parser<'heap, '_>) -> (T, JsonPointers),
    ) -> T {
        let source = self
            .sources
            .push(Source::new(text).with_path(location.to_string()));

        let mut spans = SpanTable::new(source);
        let (parsed, pointers) = parse(Parser::new(heap, &mut spans, ParserOptions::default()));

        self.spans.push(spans);
        self.origins.push(RequestSource {
            source,
            location,
            pointers,
        });

        parsed
    }

    /// Parses the query of a request and the value of each of its inputs.
    pub(crate) fn parse_in<'heap, 'scratch, S>(
        heap: &'heap Heap,
        query: &'request str,
        InputValues(values): &'request InputValues,
        mut scratch: S,
    ) -> (Self, ParsedRequest<'heap>)
    where
        S: ScopeAllocator<'scratch>,
    {
        let mut this = Self {
            sources: Sources::new(),
            spans: Vec::with_capacity(values.len() + 1),
            origins: Vec::with_capacity(values.len() + 1),
        };

        let query = this.parse_source(heap, ExpressionLocation::Query, query, |mut parser| {
            scratch.scoped(|scope| parser.parse_expr_with_pointers_in(query, &scope))
        });

        let inputs = values
            .iter()
            .map(|(name, value)| {
                this.parse_source(
                    heap,
                    ExpressionLocation::Input(Cow::Borrowed(name)),
                    value.get(),
                    |mut parser| {
                        scratch.scoped(|scope| {
                            parser.parse_value_with_pointers_in(value.get(), &scope)
                        })
                    },
                )
                .map_value(|value| (heap.alloc_symbol(name), value))
            })
            .collect_status();

        (this, ParsedRequest { query, inputs })
    }

    pub(crate) const fn sources(&self) -> &Sources<'request> {
        &self.sources
    }

    pub(crate) fn spans(&self) -> &[SpanTable<Span>] {
        &self.spans
    }

    pub(crate) fn resolve(&self, span: SpanId) -> Option<PointerSpan> {
        let absolute = span.absolute(&mut self.spans())?;
        let &RequestSource {
            source,
            ref location,
            ref pointers,
        } = self.origins.get(absolute.source().value() as usize)?;
        debug_assert_eq!(source, absolute.source());

        let pointer = if span == SpanId::SYNTHETIC {
            None
        } else {
            pointers
                .resolve(absolute.range())
                .map(SerializeThroughDisplay)
        };

        Some(PointerSpan {
            location: location.clone().into_owned(),
            range: absolute.range().into(),
            pointer,
        })
    }
}

#[cfg(test)]
mod tests {
    use alloc::borrow::Cow;

    use hashql_core::{
        heap::{Heap, Scratch},
        span::SpanId,
    };
    use hashql_diagnostics::Failure;

    use super::{InputValues, ParsedRequest, RequestSources};
    use crate::rest::internal::hashql::source::ExpressionLocation;

    /// Supplies `len` values, none of which is a value the parser accepts.
    fn input_values(len: usize) -> Result<InputValues, serde_json::Error> {
        let values: serde_json::Map<_, _> = (0..len)
            .map(|index| (index.to_string(), serde_json::Value::Array(Vec::new())))
            .collect();

        serde_json::from_str(&serde_json::Value::Object(values).to_string())
    }

    #[test]
    fn input_values_over_limit() {
        let error = input_values(InputValues::MAX_LEN + 1)
            .err()
            .expect("more values than the limit should be refused");

        assert!(
            error
                .to_string()
                .starts_with("4095 input values, expected at most 4094")
        );
    }

    #[test]
    fn resolve_synthetic() {
        let values = InputValues::default();

        let heap = Heap::new();
        let mut scratch = Scratch::new();
        let (sources, _) = RequestSources::parse_in(
            &heap,
            r##"{"#literal": 1}"##,
            &values,
            scratch.as_mut_scope(),
        );

        let span = sources
            .resolve(SpanId::SYNTHETIC)
            .expect("the span should resolve");

        assert_eq!(span.location, ExpressionLocation::Query);
        assert_eq!(span.range, 0..0);
        assert_eq!(span.pointer, None);
    }

    /// A span resolves in the source of its input for every input of a request at the limit.
    #[test]
    fn resolve_at_limit() {
        let values = input_values(InputValues::MAX_LEN).expect("the limit should be accepted");

        let heap = Heap::new();
        let mut scratch = Scratch::new();
        let (sources, ParsedRequest { inputs: parsed, .. }) = RequestSources::parse_in(
            &heap,
            r##"{"#literal": 1}"##,
            &values,
            scratch.as_mut_scope(),
        );
        let Failure { primary, secondary } = parsed.expect_err("no value should parse");

        let mut diagnostics = secondary.generalize();
        diagnostics.insert_front(primary.generalize());

        let mut locations = Vec::new();
        for diagnostic in diagnostics {
            for label in &diagnostic.labels {
                let span = sources
                    .resolve(*label.span())
                    .expect("the span should resolve");

                locations.push(span.location.to_string());
            }
        }
        locations.sort_unstable();

        let mut expected: Vec<_> = values
            .0
            .into_keys()
            .map(|name| ExpressionLocation::Input(Cow::Owned(name)).to_string())
            .collect();
        expected.sort_unstable();

        assert_eq!(locations, expected);
    }
}
