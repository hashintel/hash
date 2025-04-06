use foldhash::fast::RandomState;
use hashbrown::HashMap;
use hashql_core::{
    span::SpanId,
    symbol::{Ident, IdentKind, Symbol},
};

use crate::{
    heap::Heap,
    node::{
        expr::{CallExpr, ExprKind, LetExpr},
        id::NodeId,
        path::{Path, PathSegment},
    },
    visit::{Visitor, walk_call_expr, walk_let_expr, walk_path},
};

macro symbol {
    ($value:ident) => {
        Symbol::new(stringify!($value))
    },

    ($value:literal) => {
        Symbol::new($value)
    }
}

macro ident {
    ($value:ident) => {
        Ident {
            span: SpanId::SYNTHETIC,
            name: symbol!($value),
            kind: IdentKind::Lexical,
        }
    },

    ($value:literal) => {
        Ident {
            span: SpanId::SYNTHETIC,
            name: symbol!($value),
            kind: IdentKind::Symbol,
        }
    }
}

macro path($heap:expr; $($segment:tt)::*) {
    Path {
        id: NodeId::PLACEHOLDER,
        span: SpanId::SYNTHETIC,
        rooted: true,
        segments: {
            let mut vec = $heap.vec(Some(1 + ${count($segment)}));

            $(
                vec.push(PathSegment {
                    id: NodeId::PLACEHOLDER,
                    span: SpanId::SYNTHETIC,
                    name: ident!($segment),
                    arguments: $heap.vec(None),
                });
            )+

            vec
        },
    }
}

macro mapping($mapping:expr, $heap:expr; [$($key:tt => $($segment:tt)::*),* $(,)?]) {
    $(
        $mapping.insert(symbol!($key), path!($heap; $($segment)::*));
    )*
}

/// Resolve name aliases and turn them into their absolute counter paths.
pub struct NameResolver<'heap> {
    mapping: HashMap<Symbol, Path<'heap>, RandomState>,
    heap: &'heap Heap,
}

impl<'heap> NameResolver<'heap> {
    pub fn new(heap: &'heap Heap) -> Self {
        Self {
            mapping: HashMap::with_hasher(RandomState::default()),
            heap,
        }
    }

    fn prefill_kernel_special_forms(&mut self) {
        mapping!(self.mapping, self.heap; [
            if => kernel::special_form::if,
            is => kernel::special_form::is,
            let => kernel::special_form::let,
            use => kernel::special_form::use,
            fn => kernel::special_form::fn,
            input => kernel::special_form::input,

            "." => kernel::special_form::access,
            access => kernel::special_form::access,

            "[]" => kernel::special_form::index,
            index => kernel::special_form::index,
        ]);
    }

    fn prefill_kernel_types(&mut self) {
        mapping!(self.mapping, self.heap; [
            Boolean => kernel::type::Boolean,

            Number => kernel::type::Number,
            Integer => kernel::type::Integer,
            Natural => kernel::type::Natural,

            String => kernel::type::String,
            Url => kernel::type::Url,
            BaseUrl => kernel::type::BaseUrl,

            List => kernel::type::List,
            Tuple => kernel::type::Tuple,

            Dict => kernel::type::Dict,
            Struct => kernel::type::Struct,

            Null => kernel::type::Null,

            "?" => kernel::type::Unknown,
            Unknown => kernel::type::Unknown,

            // "!" => kernel::type::"!",
            // ^ a later step specializes "::math::not" into "::kernel::type::!" if the operation happens in the type context
            Never => kernel::type::Never,

            // "|" => kernel::type::Union,
            // ^ a later step specializes "::math::bit_or" into "::kernel::type::Union" if the operation happens in the type context
            Union => kernel::type::Union,

            // "&" => kernel::type::Intersection,
            // ^ a later step specializes "::math::bit_and" into "::kernel::type::Intersection" if the operation happens in the type context
            Intersection => kernel::type::Intersection,

            Option => kernel::type::Option,
            Result => kernel::type::Result,
        ]);
    }

    fn prefill_kernel(&mut self) {
        self.prefill_kernel_special_forms();
        self.prefill_kernel_types();
    }

    fn prefill_math(&mut self) {
        mapping!(self.mapping, self.heap; [
            "+" => math::add,
            "-" => math::sub,
            "*" => math::mul,
            "/" => math::div,
            "%" => math::mod,
            "^" => math::pow,

            "&" => math::bit_and,
            "|" => math::bit_or,
            "~" => math::bit_not,
            "<<" => math::lshift,
            ">>" => math::rshift,

            ">" => math::gt,
            "<" => math::lt,
            ">=" => math::gte,
            "<=" => math::lte,
            "==" => math::eq,
            "!=" => math::ne,

            "!" => math::not,
            "&&" => math::and,
            "||" => math::or,
        ]);
    }

    fn prefill_graph_types(&mut self) {
        mapping!(self.mapping, self.heap; [
            Graph => graph::Graph,
            SortedGraph => graph::SortedGraph,

            VariableTimeAxis => graph::VariableTimeAxis,
            PinnedTimeAxis => graph::PinnedTimeAxis,
            TimeAxis => graph::TimeAxis,

            Entities => graph::Entities,
            Relationship => graph::Relationship,

            EntityLinks => graph::EntityLinks,
            EntityProvenance => graph::EntityProvenance,
            Entity => graph::Entity,

            EntityTypeProvenance => graph::EntityTypeProvenance,
            EntityType => graph::EntityType,

            PropertyTypeProvenance => graph::PropertyTypeProvenance,
            PropertyType => graph::PropertyType,

            DataTypeProvenance => graph::DataTypeProvenance,
            DataType => graph::DataType,
        ]);
    }

    fn prefill_graph_head(&mut self) {
        mapping!(self.mapping, self.heap; [
            entities => graph::head::entities,
            entity_types => graph::head::entity_types,
            property_types => graph::head::property_types,
            data_types => graph::head::data_types,

            from_array => graph::head::from_array,
        ]);
    }

    fn prefill_graph_body(&mut self) {
        mapping!(self.mapping, self.heap; [
            map => graph::body::map,
            filter => graph::body::filter,
            flat_map => graph::body::flat_map,

            insert => graph::body::insert,
            remove => graph::body::remove,
        ]);
    }

    fn prefill_graph_tail(&mut self) {
        mapping!(self.mapping, self.heap; [
            reduce => graph::tail::reduce,

            collect => graph::tail::collect,
            select => graph::tail::select,
            exists => graph::tail::exists,

            Ordering => graph::tail::Ordering,
            SortFn => graph::tail::SortFn,

            sort_by => graph::tail::sort_by,

            // sorted methods
            Cursor => graph::tail::Cursor,
            CursorResult => graph::tail::CursorResult,

            cursor => graph::tail::cursor, // module by itself, has `cursor::after` and `cursor::before`
            offset => graph::tail::offset,
        ]);
    }

    fn prefill_graph(&mut self) {
        self.prefill_graph_types();

        self.prefill_graph_head();
        self.prefill_graph_body();
        self.prefill_graph_tail();
    }

    pub fn prefill(&mut self) {
        // Pre-fill with well-known aliases, this is a polyfill for which in the future the prelude
        // will be able to provide a more comprehensive solution.

        self.prefill_kernel();
        self.prefill_math();
        self.prefill_graph();
    }
}

impl<'heap> Visitor<'heap> for NameResolver<'heap> {
    fn visit_path(&mut self, path: &mut Path<'heap>) {
        if path.rooted {
            walk_path(self, path);
            return;
        }

        // Check if the first segment exists, and if said segment exists in our mapping
        let Some(segment) = path.segments.first() else {
            walk_path(self, path);
            return;
        };

        let Some(replacement) = self.mapping.get(&segment.name.name) else {
            walk_path(self, path);
            return;
        };

        let span = segment.span;

        path.rooted = replacement.rooted;

        // Replace the segment with the aliased value
        path.segments.splice(
            0..1,
            replacement.segments.iter().cloned().map(|mut segment| {
                // Make sure that we inherit the span from the original segment
                segment.span = span;
                segment
            }),
        );
    }

    fn visit_call_expr(&mut self, expr: &mut CallExpr<'heap>) {
        // Look for expressions that is pre-expansion and *looks* like a let expressions

        // special forms don't support labeled arguments
        if !expr.labeled_arguments.is_empty() {
            walk_call_expr(self, expr);
            return;
        }

        // let supports two forms: let/3 and let/4 (w/ or w/o type assertion)
        if expr.arguments.len() != 3 && expr.arguments.len() != 4 {
            walk_call_expr(self, expr);
            return;
        }

        // Check if the argument is a path that can be an ident
        let ExprKind::Path(function) = &mut expr.function.kind else {
            walk_call_expr(self, expr);
            return;
        };

        // First resolve the path
        self.visit_path(function);

        // Check if said path is equivalent to the let special form
        let let_special_form = self
            .mapping
            .get("let")
            .expect("let special form should be present in mapping")
            .segments
            .iter()
            .map(|segment| &segment.name);

        if !function.matches_absolute_path(let_special_form) {
            walk_call_expr(self, expr);
            return;
        }

        let arguments_length = expr.arguments.len();

        // we know this is a let expression, now we just need to make sure that both the first and
        // second-to-last argument are identifiers
        // let to: <type> = from in <body>
        let [to, from] = expr
            .arguments
            .get_disjoint_mut([0, arguments_length - 2])
            .expect("length has been verified beforehand");

        let ExprKind::Path(to) = &mut to.value.kind else {
            walk_call_expr(self, expr);
            return;
        };

        let ExprKind::Path(from) = &mut from.value.kind else {
            walk_call_expr(self, expr);
            return;
        };

        // We do **not** resolve the `to` path, as it is supposed to be an identifier
        let Some(to_ident) = to.as_ident().cloned() else {
            walk_call_expr(self, expr);
            return;
        };

        // we have a new mapping from path to type
        self.visit_path(from);
        let mut from_path = Some(from.clone());

        // we now need to call_expr, but important is that we don't apply the mapping
        // indiscriminately but instead we do so selectively on only the last argument, as that is
        // the body.

        let CallExpr {
            id,
            span,
            // We don't need to visit the function, as we've already visited it
            function: _,
            arguments,
            // We've checked beforehand that there are no labeled arguments, therefore it's
            // pointless to visit them
            labeled_arguments: _,
        } = expr;

        self.visit_id(id);
        self.visit_span(span);

        // While our call to `visit_argument` simply delegates to `visit_expr`, it's still important
        // to call it, as to not break any contracts down the line.
        for (index, argument) in arguments.iter_mut().enumerate() {
            if index == 0 {
                // The first argument is the identifier, which we shouldn't normalize
            } else if index == arguments_length - 1 {
                let from = from_path.take().unwrap_or_else(|| unreachable!());
                let old = self.mapping.insert(to_ident.name.clone(), from);

                self.visit_argument(argument);

                if let Some(old) = old {
                    self.mapping.insert(to_ident.name.clone(), old);
                }
            } else {
                self.visit_argument(argument);
            }
        }
    }

    // TODO: type and newtype expressions

    // In theory should never be called, because absolute name expansion should happen before
    // special forms are resolved. To make sure that even if it is called post-absolutization,
    // we visit let expressions.
    fn visit_let_expr(&mut self, expr: &mut LetExpr<'heap>) {
        let ExprKind::Path(value) = &mut expr.value.kind else {
            walk_let_expr(self, expr);
            return;
        };

        self.visit_path(value);
        let value = value.clone();

        let LetExpr {
            id,
            span,
            name,
            // We've already confirmed and visited the type
            value: _,
            r#type,
            body,
        } = expr;

        self.visit_id(id);
        self.visit_span(span);

        self.visit_ident(name);

        if let Some(r#type) = r#type {
            self.visit_type(r#type);
        }

        let old = self.mapping.insert(name.name.clone(), value.clone());

        self.visit_expr(body);

        if let Some(old) = old {
            self.mapping.insert(name.name.clone(), old);
        }
    }
}
