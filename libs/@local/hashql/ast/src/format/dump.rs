//! Hierarchical AST node formatter
//!
//! Provides a structured, hierarchical text representation of AST nodes with detailed information
//! about each node's properties, identifiers, and relationships. This format is designed for
//! debugging, testing, and visual inspection of parsed structures.
//!
//! ## Format
//!
//! Each node is formatted as:
//! ```text
//! <node_type>#<id>@<span> (<properties>)
//! ```
//!
//! Where:
//! - `node_type` is the type of the AST node
//! - `id` is the unique node identifier
//! - `span` is the source code span
//! - `properties` are additional node-specific properties
//!
//! Child nodes are indented with 2 spaces beneath their parent.

use core::fmt::{self, Display, Formatter};
use std::fmt::FormattingOptions;

use hashql_core::span::SpanId;

use crate::node::{
    generic::{GenericArgument, GenericParam, Generics},
    id::NodeId,
    path::{Path, PathSegment},
    r#type::{
        IntersectionType, StructField, StructType, TupleField, TupleType, Type, TypeKind, UnionType,
    },
};

fn write_indent(fmt: &mut Formatter, depth: usize) -> fmt::Result {
    for _ in 0..depth {
        fmt.write_str("  ")?;
    }

    Ok(())
}

fn write_header(
    fmt: &mut Formatter,
    depth: usize,
    name: &str,
    id: Option<NodeId>,
    span: Option<SpanId>,
    properties: Option<&str>,
) -> fmt::Result {
    write_indent(fmt, depth)?;
    fmt.write_str(name)?;

    if let Some(id) = id {
        fmt.write_str("#")?;
        Display::fmt(&id, fmt)?;
    }

    if let Some(span) = span {
        fmt.write_str("@")?;
        Display::fmt(&span, fmt)?;
    }

    if let Some(properties) = properties {
        fmt.write_str(" (")?;
        fmt.write_str(properties)?;
        fmt.write_str(")")?;
    }

    fmt.write_str("\n")?;

    Ok(())
}

/// Dumps syntax nodes into a hierarchical tree representation.
///
/// Implementors provide a structured textual dump of themselves and their children,
/// displaying node type, IDs, spans, and properties in a consistent format.
///
/// The resulting format facilitates debugging, testing, and detailed inspection of
/// the syntax tree structure.
pub trait SyntaxDump {
    /// Writes a formatted dump of this node and its children to the formatter.
    ///
    /// # Errors
    ///
    /// If formatting fails.
    fn syntax_dump(&self, fmt: &mut Formatter, depth: usize) -> fmt::Result;

    fn syntax_dump_to_string(&self) -> String {
        let mut buffer = String::new();

        self.syntax_dump(
            &mut Formatter::new(&mut buffer, FormattingOptions::new()),
            0,
        )
        .expect("Should be able to format into underlying buffer");

        buffer
    }
}

impl SyntaxDump for Type<'_> {
    fn syntax_dump(&self, fmt: &mut Formatter, depth: usize) -> fmt::Result {
        let Self { id, span, kind } = self;

        write_header(fmt, depth, "Type", Some(*id), Some(*span), None)?;

        kind.syntax_dump(fmt, depth + 1)
    }
}

impl SyntaxDump for TypeKind<'_> {
    fn syntax_dump(&self, fmt: &mut Formatter, depth: usize) -> fmt::Result {
        match self {
            TypeKind::Unknown => write_header(fmt, depth, "TypeKind", None, None, Some("Unknown")),
            TypeKind::Never => write_header(fmt, depth, "TypeKind", None, None, Some("Never")),
            TypeKind::Infer => write_header(fmt, depth, "TypeKind", None, None, Some("Infer")),
            TypeKind::Path(path) => {
                write_header(fmt, depth, "TypeKind", None, None, Some("Path"))?;

                path.syntax_dump(fmt, depth + 1)
            }
            TypeKind::Tuple(tuple_type) => {
                write_header(fmt, depth, "TypeKind", None, None, Some("Tuple"))?;

                tuple_type.syntax_dump(fmt, depth + 1)
            }
            TypeKind::Struct(struct_type) => {
                write_header(fmt, depth, "TypeKind", None, None, Some("Struct"))?;

                struct_type.syntax_dump(fmt, depth + 1)
            }
            TypeKind::Union(union_type) => {
                write_header(fmt, depth, "TypeKind", None, None, Some("Union"))?;

                union_type.syntax_dump(fmt, depth + 1)
            }
            TypeKind::Intersection(intersection_type) => {
                write_header(fmt, depth, "TypeKind", None, None, Some("Intersection"))?;

                intersection_type.syntax_dump(fmt, depth + 1)
            }
        }
    }
}

impl SyntaxDump for TupleType<'_> {
    fn syntax_dump(&self, fmt: &mut Formatter, depth: usize) -> fmt::Result {
        let Self { id, span, fields } = self;

        write_header(fmt, depth, "TupleType", Some(*id), Some(*span), None)?;

        for field in fields {
            field.syntax_dump(fmt, depth + 1)?;
        }

        Ok(())
    }
}

impl SyntaxDump for TupleField<'_> {
    fn syntax_dump(&self, fmt: &mut Formatter, depth: usize) -> fmt::Result {
        let Self { id, span, r#type } = self;

        write_header(fmt, depth, "TupleField", Some(*id), Some(*span), None)?;

        r#type.syntax_dump(fmt, depth + 1)
    }
}

impl SyntaxDump for StructType<'_> {
    fn syntax_dump(&self, fmt: &mut Formatter, depth: usize) -> fmt::Result {
        let Self { id, span, fields } = self;

        write_header(fmt, depth, "StructType", Some(*id), Some(*span), None)?;

        for field in fields {
            field.syntax_dump(fmt, depth + 1)?;
        }

        Ok(())
    }
}

impl SyntaxDump for StructField<'_> {
    fn syntax_dump(&self, fmt: &mut Formatter, depth: usize) -> fmt::Result {
        let Self {
            id,
            span,
            name,
            r#type,
        } = self;

        write_header(
            fmt,
            depth,
            "StructField",
            Some(*id),
            Some(*span),
            Some(&format!("name: {name}")),
        )?;

        r#type.syntax_dump(fmt, depth + 1)
    }
}

impl SyntaxDump for UnionType<'_> {
    fn syntax_dump(&self, fmt: &mut Formatter, depth: usize) -> fmt::Result {
        let Self { id, span, types } = self;

        write_header(fmt, depth, "UnionType", Some(*id), Some(*span), None)?;

        for r#type in types {
            r#type.syntax_dump(fmt, depth + 1)?;
        }

        Ok(())
    }
}

impl SyntaxDump for IntersectionType<'_> {
    fn syntax_dump(&self, fmt: &mut Formatter, depth: usize) -> fmt::Result {
        let Self { id, span, types } = self;

        write_header(fmt, depth, "IntersectionType", Some(*id), Some(*span), None)?;

        for r#type in types {
            r#type.syntax_dump(fmt, depth + 1)?;
        }

        Ok(())
    }
}

impl SyntaxDump for Path<'_> {
    fn syntax_dump(&self, fmt: &mut Formatter, depth: usize) -> fmt::Result {
        let Self {
            id,
            span,
            rooted,
            segments,
        } = self;

        write_header(
            fmt,
            depth,
            "Path",
            Some(*id),
            Some(*span),
            Some(&format!("rooted: {rooted}")),
        )?;

        for segment in segments {
            segment.syntax_dump(fmt, depth + 1)?;
        }

        Ok(())
    }
}

impl SyntaxDump for PathSegment<'_> {
    fn syntax_dump(&self, fmt: &mut Formatter, depth: usize) -> fmt::Result {
        let Self {
            id,
            span,
            name,
            arguments,
        } = self;

        write_header(
            fmt,
            depth,
            "PathSegment",
            Some(*id),
            Some(*span),
            Some(&format!("name: {name}")),
        )?;

        for argument in arguments {
            argument.syntax_dump(fmt, depth + 1)?;
        }

        Ok(())
    }
}

impl SyntaxDump for GenericArgument<'_> {
    fn syntax_dump(&self, fmt: &mut Formatter, depth: usize) -> fmt::Result {
        let Self { id, span, r#type } = self;

        write_header(fmt, depth, "GenericArgument", Some(*id), Some(*span), None)?;

        r#type.syntax_dump(fmt, depth + 1)
    }
}

impl SyntaxDump for GenericParam<'_> {
    fn syntax_dump(&self, fmt: &mut Formatter, depth: usize) -> fmt::Result {
        let Self {
            id,
            span,
            name,
            bound,
        } = self;

        write_header(
            fmt,
            depth,
            "GenericParam",
            Some(*id),
            Some(*span),
            Some(&format!("name: {name}")),
        )?;

        if let Some(bound) = &bound {
            bound.syntax_dump(fmt, depth + 1)?;
        }

        Ok(())
    }
}

impl SyntaxDump for Generics<'_> {
    fn syntax_dump(&self, fmt: &mut Formatter, depth: usize) -> fmt::Result {
        let Self { id, span, params } = self;

        write_header(fmt, depth, "Generics", Some(*id), Some(*span), None)?;

        for param in params {
            param.syntax_dump(fmt, depth + 1)?;
        }

        Ok(())
    }
}
