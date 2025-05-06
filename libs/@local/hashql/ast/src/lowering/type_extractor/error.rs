use alloc::borrow::Cow;

use hashql_core::{span::SpanId, symbol::Symbol, r#type::error::TypeCheckDiagnosticCategory};
use hashql_diagnostics::{
    Diagnostic,
    category::{DiagnosticCategory, TerminalDiagnosticCategory},
    color::{AnsiColor, Color},
    label::Label,
    note::Note,
    severity::Severity,
};

pub(crate) type TypeExtractorDiagnostic = Diagnostic<TypeExtractorDiagnosticCategory, SpanId>;

const DUPLICATE_TYPE_ALIAS: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "duplicate-type-alias",
    name: "Duplicate type alias name",
};

const DUPLICATE_NEWTYPE: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "duplicate-newtype",
    name: "Duplicate newtype name",
};

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum TypeExtractorDiagnosticCategory {
    DuplicateTypeAlias,
    DuplicateNewtype,
    TypeCheck(TypeCheckDiagnosticCategory),
}

impl DiagnosticCategory for TypeExtractorDiagnosticCategory {
    fn id(&self) -> Cow<'_, str> {
        Cow::Borrowed("type-extractor")
    }

    fn name(&self) -> Cow<'_, str> {
        Cow::Borrowed("Type Extractor")
    }

    fn subcategory(&self) -> Option<&dyn DiagnosticCategory> {
        match self {
            Self::DuplicateTypeAlias => Some(&DUPLICATE_TYPE_ALIAS),
            Self::DuplicateNewtype => Some(&DUPLICATE_NEWTYPE),
            Self::TypeCheck(category) => Some(category),
        }
    }
}

/// Creates a diagnostic for a duplicate type alias name.
///
/// This diagnostic is generated when the type extractor finds a duplicate type alias name
/// which should have been prevented by the name mangler at an earlier stage.
pub(crate) fn duplicate_type_alias(
    original_span: SpanId,
    duplicate_span: SpanId,
    name: Symbol<'_>,
) -> TypeExtractorDiagnostic {
    let mut diagnostic = Diagnostic::new(
        TypeExtractorDiagnosticCategory::DuplicateTypeAlias,
        Severity::COMPILER_BUG,
    );

    diagnostic.labels.extend([
        Label::new(
            original_span,
            format!("Type '{name}' was already defined here"),
        )
        .with_order(1)
        .with_color(Color::Ansi(AnsiColor::Blue)),
        Label::new(duplicate_span, "... but was redefined here")
            .with_order(0)
            .with_color(Color::Ansi(AnsiColor::Red)),
    ]);

    diagnostic.note = Some(Note::new(
        "This likely represents a compiler bug in the name mangling pass. The name mangler should \
         have given these identical names unique internal identifiers to avoid this collision. \
         Please report this issue to the HashQL team with a minimal reproduction case.",
    ));

    diagnostic
}

/// Creates a diagnostic for a duplicate newtype name.
///
/// This diagnostic is generated when the type extractor finds a duplicate newtype name
/// which should have been prevented by the name mangler at an earlier stage.
pub(crate) fn duplicate_newtype(
    original_span: SpanId,
    duplicate_span: SpanId,
    name: Symbol<'_>,
) -> TypeExtractorDiagnostic {
    let mut diagnostic = Diagnostic::new(
        TypeExtractorDiagnosticCategory::DuplicateNewtype,
        Severity::COMPILER_BUG,
    );

    diagnostic.labels.extend([
        Label::new(
            original_span,
            format!("Newtype '{name}' was already defined here"),
        )
        .with_order(1)
        .with_color(Color::Ansi(AnsiColor::Blue)),
        Label::new(duplicate_span, "... but was redefined here")
            .with_order(0)
            .with_color(Color::Ansi(AnsiColor::Red)),
    ]);

    diagnostic.note = Some(Note::new(
        "This likely represents a compiler bug in the name mangling pass. The name mangler should \
         have given these identical names unique internal identifiers to avoid this collision. \
         Please report this issue to the HashQL team with a minimal reproduction case.",
    ));

    diagnostic
}
