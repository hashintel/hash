use alloc::borrow::Cow;
use core::fmt::{self, Display};

use hashql_ast::node::{expr::ExprKind, path::Path};
use hashql_core::{span::SpanId, symbol::Symbol};
use hashql_diagnostics::{
    Diagnostic, DiagnosticIssues, Label, Status,
    category::{DiagnosticCategory, TerminalDiagnosticCategory},
    diagnostic::Message,
    severity::Severity,
};

pub type ReificationDiagnostic<K = Severity> = Diagnostic<ReificationDiagnosticCategory, SpanId, K>;
pub type ReificationDiagnosticIssues<K = Severity> =
    DiagnosticIssues<ReificationDiagnosticCategory, SpanId, K>;
pub type ReificationStatus<T> = Status<T, ReificationDiagnosticCategory, SpanId>;

const INVALID_VALUE_EXPRESSION: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "invalid-value-expression",
    name: "Invalid expression in value",
};

const UNHANDLED_ERROR: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "unhandled-error",
    name: "Unhandled error from previous compilation phase",
};

const UNPROCESSED_EXPRESSION: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "unprocessed-expression",
    name: "Unprocessed expression",
};

const INTERNAL_ERROR: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "internal-error",
    name: "Internal compiler error",
};

const UNDERSCORE_EXPRESSION: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "underscore-expression",
    name: "Invalid use of underscore expression",
};

/// Diagnostic categories emitted during AST-to-HIR reification.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum ReificationDiagnosticCategory {
    /// Non-value expression encountered during value reification.
    InvalidValueExpression,
    /// Error placeholder left by an earlier phase that failed.
    UnhandledError,
    /// AST construct that an earlier lowering pass should have removed.
    UnprocessedExpression,
    /// Violated compiler invariant detected during HIR reification.
    InternalError,
    /// Underscore placeholder used in expression position.
    UnderscoreExpression,
}

impl DiagnosticCategory for ReificationDiagnosticCategory {
    fn id(&self) -> Cow<'_, str> {
        Cow::Borrowed("reify")
    }

    fn name(&self) -> Cow<'_, str> {
        Cow::Borrowed("Reification")
    }

    fn subcategory(&self) -> Option<&dyn DiagnosticCategory> {
        match *self {
            Self::InvalidValueExpression => Some(&INVALID_VALUE_EXPRESSION),
            Self::UnhandledError => Some(&UNHANDLED_ERROR),
            Self::UnprocessedExpression => Some(&UNPROCESSED_EXPRESSION),
            Self::InternalError => Some(&INTERNAL_ERROR),
            Self::UnderscoreExpression => Some(&UNDERSCORE_EXPRESSION),
        }
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) enum ReificationTarget {
    Expr,
    Value,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) enum EnclosingSite<'heap> {
    StructField {
        field_span: SpanId,
        name: Symbol<'heap>,
    },
    TupleElement {
        container: SpanId,
        index: usize,
    },
    ListElement {
        container: SpanId,
    },
    DictKey {
        container: SpanId,
    },
    DictValue {
        container: SpanId,
    },
}

struct FormatPath<'path, 'heap>(&'path Path<'heap>);

impl Display for FormatPath<'_, '_> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        if self.0.rooted {
            fmt.write_str("::")?;
        }

        for (index, segment) in self.0.segments.iter().enumerate() {
            if index > 0 {
                fmt.write_str("::")?;
            }
            fmt.write_str(segment.name.value.as_str())?;
        }

        Ok(())
    }
}

fn add_enclosing_label(
    diagnostic: &mut ReificationDiagnostic,
    primary_span: SpanId,
    enclosing: Option<EnclosingSite<'_>>,
    target: ReificationTarget,
) {
    let Some(site) = enclosing else {
        return;
    };

    let suffix = match target {
        ReificationTarget::Expr => "",
        ReificationTarget::Value => " value",
    };

    let (span, label) = match site {
        EnclosingSite::StructField { field_span, name } => (
            field_span,
            format!("in field `{name}` of this struct{suffix}"),
        ),
        EnclosingSite::TupleElement { container, index } => (
            container,
            format!("in element {index} of this tuple{suffix}"),
        ),
        EnclosingSite::ListElement { container } => (container, format!("in this list{suffix}")),
        EnclosingSite::DictKey { container } => {
            (container, format!("in a key of this dictionary{suffix}"))
        }
        EnclosingSite::DictValue { container } => {
            (container, format!("in a value of this dictionary{suffix}"))
        }
    };

    if span != primary_span {
        diagnostic.add_label(Label::new(span, label));
    }
}

const VALID_VALUES_NOTE: &str =
    "values can only contain primitive literals, structs, tuples, lists, and dictionaries";

fn invalid_value_label(kind: &ExprKind<'_>) -> Cow<'static, str> {
    match kind {
        ExprKind::Call(call) => {
            if let ExprKind::Path(path) = &call.function.kind
                && !path.segments.is_empty()
            {
                Cow::Owned(format!(
                    "function call `{}` is not allowed in a value",
                    FormatPath(path)
                ))
            } else {
                Cow::Borrowed("function calls are not allowed in values")
            }
        }
        ExprKind::Path(path) => match path.segments.as_slice() {
            [segment] if !path.rooted => Cow::Owned(format!(
                "variable `{}` is not allowed in a value",
                segment.name.value
            )),
            [_, ..] => Cow::Owned(format!(
                "path `{}` is not allowed in a value",
                FormatPath(path)
            )),
            [] => Cow::Borrowed("path expressions are not allowed in values"),
        },
        ExprKind::As(_) => Cow::Borrowed("type assertions are not allowed in values"),
        ExprKind::Let(_) => Cow::Borrowed("`let` bindings are not allowed in values"),
        ExprKind::Type(_) => Cow::Borrowed("`type` declarations are not allowed in values"),
        ExprKind::NewType(_) => Cow::Borrowed("`newtype` declarations are not allowed in values"),
        ExprKind::Input(input) => Cow::Owned(format!(
            "`input` declaration `{}` is not allowed in a value",
            input.name.value
        )),
        ExprKind::Closure(_) => Cow::Borrowed("closures are not allowed in values"),
        ExprKind::If(_) => Cow::Borrowed("`if` expressions are not allowed in values"),
        ExprKind::Field(_) => Cow::Borrowed("field accesses are not allowed in values"),
        ExprKind::Index(_) => Cow::Borrowed("index expressions are not allowed in values"),
        ExprKind::Underscore => Cow::Borrowed("`_` is not allowed in values"),
        ExprKind::Struct(_)
        | ExprKind::Dict(_)
        | ExprKind::Tuple(_)
        | ExprKind::List(_)
        | ExprKind::Literal(_)
        | ExprKind::Dummy => {
            unreachable!("value expressions and dummy placeholders are handled before this")
        }
    }
}

fn invalid_value_help(kind: &ExprKind<'_>) -> &'static str {
    match kind {
        ExprKind::Call(_) => {
            "evaluate the call beforehand or replace it with a literal or compound value"
        }
        ExprKind::Path(_) => "replace the reference with a concrete literal or compound value",
        ExprKind::As(_) => "remove the `as` type assertion and provide the value directly",
        ExprKind::Let(_) => "inline the bound value directly instead of using `let`",
        ExprKind::Type(_) => "remove the `type` declaration and provide a data value directly",
        ExprKind::NewType(_) => {
            "remove the `newtype` declaration and provide a data value directly"
        }
        ExprKind::Input(_) => "supply a concrete value rather than declaring another input",
        ExprKind::Closure(_) => "replace the closure with a literal or compound data value",
        ExprKind::If(_) => {
            "resolve the condition beforehand and supply the resulting value directly"
        }
        ExprKind::Field(_) => "supply the field value directly instead of projecting it",
        ExprKind::Index(_) => {
            "supply the indexed element directly instead of indexing into a collection"
        }
        ExprKind::Underscore => "replace `_` with a concrete literal or compound value",
        ExprKind::Struct(_)
        | ExprKind::Dict(_)
        | ExprKind::Tuple(_)
        | ExprKind::List(_)
        | ExprKind::Literal(_)
        | ExprKind::Dummy => {
            unreachable!("value expressions and dummy placeholders are handled before this")
        }
    }
}

/// Reports a non-value expression encountered during value reification.
pub(crate) fn invalid_value_expression(
    span: SpanId,
    kind: &ExprKind<'_>,
    enclosing: Option<EnclosingSite<'_>>,
) -> ReificationDiagnostic {
    let mut diagnostic = Diagnostic::new(
        ReificationDiagnosticCategory::InvalidValueExpression,
        Severity::Error,
    )
    .primary(Label::new(span, invalid_value_label(kind)));

    if let ExprKind::As(r#as) = kind
        && r#as.r#type.span != span
    {
        diagnostic.add_label(Label::new(r#as.r#type.span, "type assertion here"));
    }

    add_enclosing_label(&mut diagnostic, span, enclosing, ReificationTarget::Value);

    diagnostic.add_message(Message::help(invalid_value_help(kind)));
    diagnostic.add_message(Message::note(VALID_VALUES_NOTE));
    diagnostic
}

/// Reports an error placeholder left by an earlier compilation phase.
#[coverage(off)] // compiler bugs should never be hit
pub(crate) fn dummy_expression(span: SpanId, target: ReificationTarget) -> ReificationDiagnostic {
    let (label, note) = match target {
        ReificationTarget::Expr => (
            "unresolved error placeholder reached HIR reification",
            "HIR reification requires a valid AST with no error placeholders",
        ),
        ReificationTarget::Value => (
            "unresolved error placeholder reached HIR value reification",
            "HIR value reification requires a valid value AST with no error placeholders",
        ),
    };

    let mut diagnostic =
        Diagnostic::new(ReificationDiagnosticCategory::UnhandledError, Severity::Bug)
            .primary(Label::new(span, label));

    diagnostic.add_message(Message::help(
        "an earlier compilation phase failed and inserted a placeholder node; inspect the \
         diagnostics above for the root cause",
    ));
    diagnostic.add_message(Message::note(note));
    diagnostic
}

/// Reports an AST construct that an earlier lowering pass should have removed.
#[coverage(off)] // compiler bugs should never be hit
pub(crate) fn unprocessed_expression(
    span: SpanId,
    expr_kind: &str,
    phase_name: &str,
) -> ReificationDiagnostic {
    let mut diagnostic = Diagnostic::new(
        ReificationDiagnosticCategory::UnprocessedExpression,
        Severity::Bug,
    )
    .primary(Label::new(
        span,
        format!("{expr_kind} was not lowered before HIR reification"),
    ));

    diagnostic.add_message(Message::help(format!(
        "ensure {phase_name} runs to completion before HIR reification"
    )));
    diagnostic.add_message(Message::note(format!(
        "{expr_kind} nodes are lowered out of the AST before HIR reification and have no HIR \
         representation"
    )));
    diagnostic
}

/// Reports a violated compiler invariant detected during HIR reification.
#[coverage(off)] // compiler bugs should never be hit
pub(crate) fn internal_error(span: SpanId, message: &str) -> ReificationDiagnostic {
    let mut diagnostic =
        Diagnostic::new(ReificationDiagnosticCategory::InternalError, Severity::Bug).primary(
            Label::new(span, format!("internal reification error: {message}")),
        );

    diagnostic.add_message(Message::note(
        "this is a bug in the HashQL compiler; an invariant from an earlier phase was violated",
    ));
    diagnostic
}

/// Reports an underscore placeholder used where a value expression is required.
pub(crate) fn underscore_expression(
    span: SpanId,
    enclosing: Option<EnclosingSite<'_>>,
) -> ReificationDiagnostic {
    let mut diagnostic = Diagnostic::new(
        ReificationDiagnosticCategory::UnderscoreExpression,
        Severity::Error,
    )
    .primary(Label::new(span, "`_` cannot be used as an expression"));

    add_enclosing_label(&mut diagnostic, span, enclosing, ReificationTarget::Expr);

    diagnostic.add_message(Message::help(
        "replace `_` with a concrete expression or variable reference",
    ));
    diagnostic.add_message(Message::note(
        "`_` is a placeholder reserved for inferred types, unbounded generic parameters, and \
         same-name `use` imports",
    ));
    diagnostic
}
