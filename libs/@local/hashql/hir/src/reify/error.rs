use alloc::borrow::Cow;

use hashql_core::span::SpanId;
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

const UNSUPPORTED_CONSTRUCT: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "unsupported-construct",
    name: "Unsupported language construct",
};

const UNHANDLED_ERROR: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "unhandled-error",
    name: "Unhandled error from previous compilation phase",
};

const UNPROCESSED_EXPRESSION: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "unprocessed-expression",
    name: "Expression should have been processed earlier",
};

const INTERNAL_ERROR: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "internal-error",
    name: "Internal compiler error",
};

const UNDERSCORE_EXPRESSION: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "underscore-expression",
    name: "Invalid use of underscore expression",
};

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum ReificationDiagnosticCategory {
    UnsupportedConstruct,
    UnhandledError,
    UnprocessedExpression,
    InternalError,
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
            Self::UnsupportedConstruct => Some(&UNSUPPORTED_CONSTRUCT),
            Self::UnhandledError => Some(&UNHANDLED_ERROR),
            Self::UnprocessedExpression => Some(&UNPROCESSED_EXPRESSION),
            Self::InternalError => Some(&INTERNAL_ERROR),
            Self::UnderscoreExpression => Some(&UNDERSCORE_EXPRESSION),
        }
    }
}

/// Creates a diagnostic for an unsupported language construct.
///
/// This is a temporary error for features that are not yet implemented
/// but will be supported in the near future.
pub(crate) fn unsupported_construct(
    span: SpanId,
    construct_name: &str,
    issue_url: &str,
) -> ReificationDiagnostic {
    let mut diagnostic = Diagnostic::new(
        ReificationDiagnosticCategory::UnsupportedConstruct,
        Severity::Error,
    )
    .primary(Label::new(
        span,
        format!("`{construct_name}` not supported yet"),
    ));

    diagnostic.add_message(Message::help(format!(
        "The {construct_name} syntax is valid HashQL code, but support for this feature is still \
         in development. For now, you'll need to use alternative approaches to achieve the same \
         result. Check issue {issue_url} for implementation status and updates."
    )));

    diagnostic.add_message(Message::note(format!(
        "This is a temporary limitation. We're actively working on supporting {construct_name} \
         constructs and other advanced features to make HashQL more expressive and powerful."
    )));

    diagnostic
}

/// Creates a diagnostic for an unhandled error from a previous phase.
///
/// This indicates that a fatal error occurred in a previous compilation phase,
/// but the error wasn't properly handled.
#[coverage(off)] // compiler bugs should never be hit
pub(crate) fn dummy_expression(span: SpanId) -> ReificationDiagnostic {
    let mut diagnostic =
        Diagnostic::new(ReificationDiagnosticCategory::UnhandledError, Severity::Bug)
            .primary(Label::new(span, "fatal error occurred here"));

    diagnostic.add_message(Message::help(
        "The compiler encountered a fatal error in an earlier phase but continued processing. \
         This should not happen and indicates a bug in the error handling system. The original \
         error message should appear above this one and contains more specific information about \
         what went wrong with your code.",
    ));

    diagnostic.add_message(Message::note(
        "HashQL compiles your code in several phases, and errors in early phases should prevent \
         later phases from running. When you see this message, it means the compiler tried to \
         continue despite a fatal error.",
    ));

    diagnostic
}

/// Creates a diagnostic for an expression that should have been processed
/// during an earlier compilation stage.
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
        format!("`{expr_kind}` should have been processed earlier"),
    ));

    diagnostic.add_message(Message::help(format!(
        "The {expr_kind} expression should have been processed during an earlier phase \
         ({phase_name}) but reached the final processing stage unchanged. This suggests a problem \
         in the compiler pipeline."
    )));

    diagnostic.add_message(Message::note(
        "The HashQL compiler transforms your code through several phases before generating the \
         final output. Some language constructs should be handled by specific phases and be \
         removed from the AST before reaching the final processing stage.",
    ));

    diagnostic
}

/// Creates a diagnostic for general internal compiler errors.
#[coverage(off)] // compiler bugs should never be hit
pub(crate) fn internal_error(span: SpanId, message: &str) -> ReificationDiagnostic {
    let mut diagnostic =
        Diagnostic::new(ReificationDiagnosticCategory::InternalError, Severity::Bug)
            .primary(Label::new(span, "compiler error occurred here"));

    diagnostic.add_message(Message::help(format!(
        "The compiler encountered an unexpected situation while processing your code: \
         \"{message}\"."
    )));

    diagnostic.add_message(Message::note(
        "This indicates that an earlier compilation stage failed without reporting any errors. \
         The compiler continued with incomplete or invalid information, which was only detected \
         during the final processing phase.",
    ));

    diagnostic
}

/// Creates a diagnostic for invalid use of underscore expressions.
///
/// Underscore expressions are only allowed on the left-hand side of assignments.
pub(crate) fn underscore_expression(span: SpanId) -> ReificationDiagnostic {
    let mut diagnostic = Diagnostic::new(
        ReificationDiagnosticCategory::UnderscoreExpression,
        Severity::Error,
    )
    .primary(Label::new(span, "`_` not allowed here"));

    diagnostic.add_message(Message::help(
        "In expressions, `_` can only be used on the left-hand side of an assignment.",
    ));

    diagnostic.add_message(Message::note(
        "The underscore symbol `_` is a special placeholder that can only be used in specific \
         contexts. Currently, it's only valid as an assignment target, not as a value in \
         expressions.",
    ));

    diagnostic
}
