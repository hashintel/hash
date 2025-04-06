pub mod error;

use foldhash::fast::{FoldHasher, RandomState};
use hashbrown::{HashMap, HashSet};
use hashql_core::{
    span::SpanId,
    symbol::{Ident, IdentKind, Symbol},
};

use crate::{
    heap::Heap,
    node::{
        id::NodeId,
        path::{Path, PathSegment},
    },
};

macro ident {
    ($value:ident) => {
        Ident {
            span: SpanId::SYNTHETIC,
            name: Symbol::new(stringify!($value)),
            kind: IdentKind::Lexical,
        }
    },

    ($value:literal) => {
        Ident {
            span: SpanId::SYNTHETIC,
            name: Symbol::new($value),
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
        $mapping.insert(ident!($key), path!($heap; $($segment)::*));
    )*
}

/// Resolve name aliases and turn them into their absolute counter paths.
pub struct ResolveNames<'heap> {
    mapping: HashMap<Ident, Path<'heap>, RandomState>,
    heap: &'heap Heap,
}

impl<'heap> ResolveNames<'heap> {
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

            "?" => kernel::type::"?",
            "!" => kernel::type::"!",

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

            "&" => math::and,
            "|" => math::or,
            "~" => math::not,
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
