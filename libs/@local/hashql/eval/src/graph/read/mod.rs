mod convert;
pub mod error;
mod filter;
mod filter_expr;
mod path;
mod sink;

use core::{fmt::Debug, ops::Range};

use hash_graph_store::filter::{Filter, QueryRecord};
use hashql_core::{
    collection::FastHashMap, heap::Heap, span::SpanId, symbol::Symbol, value::Value,
};
use hashql_diagnostics::DiagnosticIssues;
use hashql_hir::{
    node::{
        HirId, Node,
        graph::read::{GraphRead, GraphReadBody, GraphReadHead},
        kind::NodeKind,
        r#let::Let,
    },
    visit::{self, Visitor},
};
use type_system::knowledge::Entity;

use self::{
    error::{GraphReadCompilerIssues, GraphReadCompilerStatus},
    path::CompleteQueryPath,
    sink::FilterSink,
};

// The FilterSlice is an indirect approach to allow us to easily copy a filter between different
// nodes.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum FilterSlice {
    Entity { range: Range<usize> },
}

#[derive(Debug, Clone, PartialEq, Default)]
pub struct Filters<'heap> {
    entity: Vec<Filter<'heap, Entity>>,
}

impl<'heap> Filters<'heap> {
    #[must_use]
    pub fn entity(&self, range: Range<usize>) -> &[Filter<'heap, Entity>] {
        &self.entity[range]
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
struct FilterCompilerContext<'heap> {
    span: SpanId,
    current_span: Option<SpanId>,
    param_name: Symbol<'heap>,
}

impl FilterCompilerContext<'_> {
    const fn without_current_span(self) -> Self {
        Self {
            span: self.span,
            current_span: None,
            param_name: self.param_name,
        }
    }

    const fn with_current_span(self, span: SpanId) -> Self {
        Self {
            span: self.span,
            current_span: Some(span),
            param_name: self.param_name,
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct GraphReadCompilerResidual<'heap> {
    pub filters: Filters<'heap>,
    pub output: FastHashMap<HirId, FilterSlice>,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
struct CompilationError;

pub struct GraphReadCompiler<'env, 'heap> {
    current: HirId,
    heap: &'heap Heap,
    filters: Filters<'heap>,

    diagnostics: GraphReadCompilerIssues,

    locals: FastHashMap<Symbol<'heap>, &'heap Node<'heap>>,
    inputs: &'env FastHashMap<Symbol<'heap>, Value<'heap>>,
    output: FastHashMap<HirId, FilterSlice>,
}

impl<'env, 'heap: 'env> GraphReadCompiler<'env, 'heap> {
    pub fn new(heap: &'heap Heap, inputs: &'env FastHashMap<Symbol<'heap>, Value<'heap>>) -> Self {
        Self {
            current: HirId::PLACEHOLDER,
            heap,
            filters: Filters::default(),
            diagnostics: DiagnosticIssues::new(),
            locals: FastHashMap::default(),
            inputs,
            output: FastHashMap::default(),
        }
    }

    /// Finish the compilation process.
    ///
    /// # Errors
    ///
    /// Returns an error if any diagnostics were collected during compilation.
    pub fn finish(self) -> GraphReadCompilerStatus<GraphReadCompilerResidual<'heap>> {
        self.diagnostics.into_status(GraphReadCompilerResidual {
            filters: self.filters,
            output: self.output,
        })
    }

    fn compile_graph_body<R>(
        &mut self,
        body: &'heap [GraphReadBody<'heap>],
    ) -> Result<Vec<Filter<'heap, R>>, CompilationError>
    where
        R: QueryRecord<QueryPath<'heap>: CompleteQueryPath<'heap, PartialQueryPath: Debug>>,
    {
        let mut filters = Ok(Vec::new());

        for body in body {
            match body {
                GraphReadBody::Filter(node) => {
                    let NodeKind::Closure(closure) = node.kind else {
                        unreachable!()
                    };

                    let mut sink = FilterSink::from_result(&mut filters);

                    let filter = self.compile_filter::<R>(
                        FilterCompilerContext {
                            span: closure.body.span,
                            current_span: None,
                            param_name: closure.signature.params[0].name.value,
                        },
                        &closure.body,
                        &mut sink,
                    );

                    if let Err(error) = filter {
                        filters = Err(error);
                    }
                }
            }
        }

        filters
    }

    fn compile_graph_read(
        &mut self,
        read: &'heap GraphRead<'heap>,
    ) -> Result<FilterSlice, CompilationError> {
        match read.head {
            GraphReadHead::Entity { axis: _ } => {
                let filters = self.compile_graph_body(&read.body)?;

                let start = self.filters.entity.len();
                self.filters.entity.extend(filters);
                let end = self.filters.entity.len();

                Ok(FilterSlice::Entity { range: start..end })
            }
        }
    }
}

impl<'heap> Visitor<'heap> for GraphReadCompiler<'_, 'heap> {
    fn visit_node(&mut self, node: &Node<'heap>) {
        if self.output.contains_key(&node.id) {
            return; // We've already processed this node, so skip it.
        }

        let previous = self.current;
        self.current = node.id;

        visit::walk_node(self, node);

        self.current = previous;
    }

    fn visit_let(&mut self, r#let: &'heap Let<'heap>) {
        self.locals.insert(r#let.name.value, &r#let.value);
        visit::walk_let(self, r#let);
        self.locals.remove(&r#let.name.value);

        if let Some(value) = self.output.get(&r#let.body.id) {
            self.output.insert(self.current, value.clone());
        }
    }

    fn visit_graph_read(&mut self, graph_read: &'heap GraphRead<'heap>) {
        visit::walk_graph_read(self, graph_read);

        if let Ok(filter) = self.compile_graph_read(graph_read) {
            self.output
                .try_insert(self.current, filter)
                .expect("Same node shouldn't be processed multiple times");
        }
    }
}
