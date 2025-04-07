use core::mem;

use foldhash::fast::RandomState;
use hashbrown::HashMap;
use hashql_core::{
    span::SpanId,
    symbol::{Ident, IdentKind, Symbol},
};

use crate::{
    heap::Heap,
    node::{
        expr::{CallExpr, ExprKind, LetExpr, NewTypeExpr, TypeExpr},
        id::NodeId,
        path::{Path, PathSegment},
        r#type::TypeKind,
    },
    visit::{Visitor, walk_call_expr, walk_let_expr, walk_newtype_expr, walk_path, walk_type_expr},
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
            type => kernel::special_form::type,
            newtype => kernel::special_form::newtype,
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

    fn walk_call(&mut self, expr: &mut CallExpr<'heap>, to: &Ident, mut from: Option<Path<'heap>>) {
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

        let len = arguments.len();

        // While our call to `visit_argument` simply delegates to `visit_expr`, it's still important
        // to call it, as to not break any contracts down the line.
        for (index, argument) in arguments.iter_mut().enumerate() {
            if index == 0 {
                // The first argument is the identifier, which we shouldn't normalize
            } else if index == len - 1 {
                let old = if let Some(from) = from.take() {
                    self.mapping.insert(to.name.clone(), from)
                } else {
                    self.mapping.remove(&to.name)
                };

                self.visit_argument(argument);

                if let Some(old) = old {
                    self.mapping.insert(to.name.clone(), old);
                } else {
                    // The binding hasn't existed before, therefore restoration = deletion
                    self.mapping.remove(&to.name);
                }
            } else {
                self.visit_argument(argument);
            }
        }
    }

    fn absolute_path<'this>(
        &'this self,
        name: &str,
    ) -> impl ExactSizeIterator<Item = &'this Symbol> {
        self.mapping
            .get(name)
            .expect("let special form should be present in mapping")
            .segments
            .iter()
            .map(|segment| &segment.name.name)
    }
}

impl<'heap> Visitor<'heap> for NameResolver<'heap> {
    fn visit_path(&mut self, path: &mut Path<'heap>) {
        if path.rooted {
            walk_path(self, path);
            return;
        }

        // Check if the first segment exists, and if said segment exists in our mapping
        let Some(segment) = path.segments.first_mut() else {
            walk_path(self, path);
            return;
        };

        let Some(replacement) = self.mapping.get(&segment.name.name) else {
            // ... and back with you to the original segment

            walk_path(self, path);
            return;
        };

        let mut arguments = Some(mem::replace(&mut segment.arguments, self.heap.vec(None)));

        let span = segment.span;

        path.rooted = replacement.rooted;

        let replacement_len = replacement.segments.len();

        // Replace the segment with the aliased value
        path.segments.splice(
            0..1,
            replacement
                .segments
                .iter()
                .cloned()
                .enumerate()
                .map(|(index, mut segment)| {
                    // Make sure that we inherit the span from the original segment
                    segment.span = span;

                    if index == replacement_len - 1 {
                        segment.arguments = arguments.take().unwrap_or_else(|| unreachable!());
                    }

                    segment
                }),
        );

        walk_path(self, path);
    }

    fn visit_call_expr(&mut self, expr: &mut CallExpr<'heap>) {
        #[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
        enum Kind {
            Let,
            Type,
            Newtype,
        }
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
        // In theory as we're accessing the path here, we'd need to call `visit_id` and `visit_span`
        // as well here, but we're not interested in those this is actually a no-op and therefore
        // fine to omit.
        self.visit_path(function);

        // Check if said path is equivalent to the let special form
        let kind = if function.matches_absolute_path(self.absolute_path("let")) {
            Kind::Let
        } else if function.matches_absolute_path(self.absolute_path("type")) {
            Kind::Type
        } else if function.matches_absolute_path(self.absolute_path("newtype")) {
            Kind::Newtype
        } else {
            walk_call_expr(self, expr);
            return;
        };

        let arguments_length = expr.arguments.len();

        if kind != Kind::Let && arguments_length != 3 {
            // `type/4` and `newtype/4` do **not** exist
            walk_call_expr(self, expr);
            return;
        }

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

        // We do **not** resolve the `to` path, as it is supposed to be an identifier
        let Some(to) = to.as_ident().cloned() else {
            walk_call_expr(self, expr);
            return;
        };

        let ExprKind::Path(from) = &mut from.value.kind else {
            // While it isn't a path and therefore not an alias, this is still a valid assignment,
            // therefore we need to actually *remove* the mapping for the duration of the call.

            self.walk_call(expr, &to, None);
            return;
        };

        // we have a new mapping from path to type
        self.visit_path(from);
        let from = Some(from.clone());

        self.walk_call(expr, &to, from);
    }

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

        let old = self.mapping.insert(name.name.clone(), value);

        self.visit_expr(body);

        if let Some(old) = old {
            self.mapping.insert(name.name.clone(), old);
        } else {
            self.mapping.remove(&name.name);
        }
    }

    fn visit_type_expr(&mut self, expr: &mut TypeExpr<'heap>) {
        let TypeKind::Path(path) = &mut expr.value.kind else {
            walk_type_expr(self, expr);
            return;
        };

        self.visit_path(path);
        let path = path.clone();

        let TypeExpr {
            id,
            span,
            name,
            // We've already confirmed and visited the type
            value: _,
            body,
        } = expr;

        self.visit_id(id);
        self.visit_span(span);

        self.visit_ident(name);

        let old = self.mapping.insert(name.name.clone(), path);

        self.visit_expr(body);

        if let Some(old) = old {
            self.mapping.insert(name.name.clone(), old);
        } else {
            self.mapping.remove(&name.name);
        }
    }

    fn visit_newtype_expr(&mut self, expr: &mut NewTypeExpr<'heap>) {
        let TypeKind::Path(path) = &mut expr.value.kind else {
            walk_newtype_expr(self, expr);
            return;
        };

        self.visit_id(&mut expr.value.id);
        self.visit_span(&mut expr.value.span);
        self.visit_path(path);
        let path = path.clone();

        let NewTypeExpr {
            id,
            span,
            name,
            // We've already confirmed and visited the type
            value: _,
            body,
        } = expr;

        self.visit_id(id);
        self.visit_span(span);

        self.visit_ident(name);

        let old = self.mapping.insert(name.name.clone(), path);

        self.visit_expr(body);

        if let Some(old) = old {
            self.mapping.insert(name.name.clone(), old);
        } else {
            self.mapping.remove(&name.name);
        }
    }
}
