use std::borrow::Cow;

use hashql_core::{span::SpanId, symbol::Symbol};
use hashql_diagnostics::{
    Category, Diagnostic, Help, Label, Note, Severity, category::DiagnosticCategory,
};

pub(crate) type ImportResolverDiagnostic = Diagnostic<ImportResolverDiagnosticCategory, SpanId>;

const GENERIC_ARGUMENTS_IN_USE_PATH: Category = Category {
    id: "generic-arguments-in-use-path",
    name: "Generic arguments not allowed in import paths",
};

const EMPTY_PATH: Category = Category {
    id: "empty-path",
    name: "Empty path in import statement",
};

const GENERIC_ARGUMENTS_IN_MODULE: Category = Category {
    id: "generic-arguments-in-module",
    name: "Generic arguments only allowed in final path segment",
};

const UNKNOWN_IMPORT: Category = Category {
    id: "unknown-import",
    name: "Unknown import path",
};

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum ImportResolverDiagnosticCategory {
    GenericArgumentsInUsePath,
    EmptyPath,
    GenericArgumentsInModule,
    UnknownImport,
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
            Self::UnknownImport => Some(&UNKNOWN_IMPORT),
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

/// Represents problem location in an import path
pub enum ImportProblem {
    /// A module in the path doesn't exist
    Module {
        /// Index of the problematic segment
        segment_index: usize,
        /// Possible alternative modules
        suggestions: Vec<Suggestion>,
    },
    /// The symbol being imported doesn't exist in the module
    Symbol {
        /// The symbol that wasn't found
        symbol: Symbol,
        /// Possible alternative symbols
        suggestions: Vec<Suggestion>,
    },
    /// No symbols were found for a glob import
    EmptyGlob,
    /// The path couldn't be resolved for an unknown reason
    Unknown,
}

/// Error when an import path cannot be resolved
pub(crate) fn unknown_import(
    span: SpanId,
    path: &[Symbol],
    problem: ImportProblem,
) -> ImportResolverDiagnostic {
    let mut diagnostic = Diagnostic::new(
        ImportResolverDiagnosticCategory::UnknownImport,
        Severity::ERROR,
    );

    let path_str = path
        .iter()
        .map(|s| s.to_string())
        .collect::<Vec<_>>()
        .join("::");

    match &problem {
        ImportProblem::Module {
            segment_index,
            suggestions,
        } => {
            // Get the problematic module name
            let module_name = if *segment_index < path.len() {
                path[*segment_index].to_string()
            } else {
                "<unknown>".to_string()
            };

            diagnostic
                .labels
                .push(Label::new(span, format!("Unknown module '{module_name}'")));

            let mut help = format!("The module '{module_name}' doesn't exist in this scope.");

            // Add suggestions if available
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

            diagnostic.help = Some(Help::new(help));
        }

        ImportProblem::Symbol {
            symbol,
            suggestions,
        } => {
            diagnostic
                .labels
                .push(Label::new(span, format!("Symbol '{symbol}' not found")));

            let mut help = format!("The symbol '{symbol}' doesn't exist in module '{path_str}'.");

            // Add suggestions if available
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

            diagnostic.help = Some(Help::new(help));

            diagnostic.note = Some(Note::new(
                "Check if the symbol is public and spelled correctly, or if it needs to be \
                 imported from another module.",
            ));
        }

        ImportProblem::EmptyGlob => {
            diagnostic
                .labels
                .push(Label::new(span, "No importable symbols found"));

            diagnostic.help = Some(Help::new(format!(
                "Module '{path_str}' exists but contains no public symbols that can be imported."
            )));

            diagnostic.note = Some(Note::new(
                "Consider using a specific import instead of a glob import, or check if the \
                 module is empty.",
            ));
        }

        ImportProblem::Unknown => {
            diagnostic.labels.push(Label::new(span, "Import not found"));

            diagnostic.help = Some(Help::new(format!(
                "Unable to resolve the import path '{path_str}'. Check that it exists and is \
                 spelled correctly."
            )));
        }
    }

    diagnostic
}
