use std::borrow::Cow;

use hashql_core::{span::SpanId, symbol::Symbol};
use hashql_diagnostics::{
    Diagnostic,
    category::{DiagnosticCategory, TerminalDiagnosticCategory},
    help::Help,
    label::Label,
    note::Note,
    severity::Severity,
};

pub(crate) type ImportResolverDiagnostic = Diagnostic<ImportResolverDiagnosticCategory, SpanId>;

const GENERIC_ARGUMENTS_IN_USE_PATH: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "generic-arguments-in-use-path",
    name: "Generic arguments not allowed in import paths",
};

const EMPTY_PATH: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "empty-path",
    name: "Empty path in import statement",
};

const GENERIC_ARGUMENTS_IN_MODULE: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "generic-arguments-in-module",
    name: "Generic arguments only allowed in final path segment",
};

const UNRESOLVED_IMPORT: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "unresolved-import",
    name: "Unresolved import path",
};

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum ImportResolverDiagnosticCategory {
    GenericArgumentsInUsePath,
    EmptyPath,
    GenericArgumentsInModule,
    UnresolvedImport,
}

impl DiagnosticCategory for ImportResolverDiagnosticCategory {
    fn id(&self) -> Cow<'_, str> {
        Cow::Borrowed("import-resolver")
    }

    fn name(&self) -> Cow<'_, str> {
        Cow::Borrowed("Import Resolver")
    }

    fn subcategory(&self) -> Option<&dyn DiagnosticCategory> {
        match self {
            Self::GenericArgumentsInUsePath => Some(&GENERIC_ARGUMENTS_IN_USE_PATH),
            Self::EmptyPath => Some(&EMPTY_PATH),
            Self::GenericArgumentsInModule => Some(&GENERIC_ARGUMENTS_IN_MODULE),
            Self::UnresolvedImport => Some(&UNRESOLVED_IMPORT),
        }
    }
}

/// Error when generic arguments are used in a use path segment
pub(crate) fn generic_arguments_in_use_path(span: SpanId) -> ImportResolverDiagnostic {
    let mut diagnostic = Diagnostic::new(
        ImportResolverDiagnosticCategory::GenericArgumentsInUsePath,
        Severity::ERROR,
    );

    diagnostic
        .labels
        .push(Label::new(span, "Remove these generic arguments"));

    diagnostic.help = Some(Help::new(
        "Use statements don't accept generic type parameters. Remove the angle brackets and type \
         parameters.",
    ));

    diagnostic.note = Some(Note::new(
        "Import paths only identify modules and items to bring into scope, not specific generic \
         instantiations.",
    ));

    diagnostic
}

/// Error when a path has no segments
pub(crate) fn empty_path(span: SpanId) -> ImportResolverDiagnostic {
    let mut diagnostic =
        Diagnostic::new(ImportResolverDiagnosticCategory::EmptyPath, Severity::ERROR);

    diagnostic
        .labels
        .push(Label::new(span, "Specify a path here"));

    diagnostic.help = Some(Help::new(
        "Add a valid path with at least one identifier, such as `module` or `module::item`.",
    ));

    diagnostic
}

/// Error when generic arguments are used in a module path segment
pub(crate) fn generic_arguments_in_module(span: SpanId) -> ImportResolverDiagnostic {
    let mut diagnostic = Diagnostic::new(
        ImportResolverDiagnosticCategory::GenericArgumentsInModule,
        Severity::ERROR,
    );

    diagnostic
        .labels
        .push(Label::new(span, "Remove these generic arguments"));

    diagnostic.help = Some(Help::new(
        "Generic arguments can only appear on the final type in a path. Remove them from this \
         module segment.",
    ));

    diagnostic.note = Some(Note::new(
        "To use generic parameters, apply them only to the final type: \
         `module::submodule::Type<T>`.",
    ));

    diagnostic
}

/// A struct to hold name suggestions with similarity scores
#[derive(Debug, Clone)]
pub struct Suggestion {
    /// The suggested name
    pub name: String,
    /// Similarity score (higher is better, typically 0.0-1.0)
    pub score: f64,
}

/// Error when an import path cannot be resolved
pub(crate) fn unresolved_import(
    span: SpanId,
    path: &[Symbol],
    suggestions: Option<Vec<Suggestion>>,
) -> ImportResolverDiagnostic {
    let mut diagnostic = Diagnostic::new(
        ImportResolverDiagnosticCategory::UnresolvedImport,
        Severity::ERROR,
    );

    let path_str = if path.is_empty() {
        "<empty>".to_string()
    } else {
        path.iter()
            .map(|symbol| symbol.to_string())
            .collect::<Vec<_>>()
            .join("::")
    };

    diagnostic
        .labels
        .push(Label::new(span, "Unresolved import"));

    let mut help = format!(
        "Cannot resolve the import path '{path_str}'. Check that it exists and is spelled \
         correctly."
    );

    // Add suggestions if available
    if let Some(suggestions) = suggestions {
        if !suggestions.is_empty() {
            let top_suggestions: Vec<_> = suggestions.iter()
                .filter(|s| s.score > 0.7) // Only include reasonably good matches
                .take(3)                  // Limit to top 3
                .map(|s| s.name.clone())
                .collect();

            if !top_suggestions.is_empty() {
                let suggestion_str = top_suggestions.join("', '");
                help.push_str(&format!("\n\nDid you mean: '{suggestion_str}'?"));
            }
        }
    }

    diagnostic.help = Some(Help::new(help));

    diagnostic.note = Some(Note::new(
        "Make sure you've imported any required modules and that exported items are public and \
         spelled correctly.",
    ));

    diagnostic
}
