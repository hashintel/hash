use alloc::borrow::Cow;
use core::fmt::{self, Display};

use hashql_core::{similarity::did_you_mean, span::SpanId};
use hashql_diagnostics::{
    Diagnostic,
    category::{DiagnosticCategory, TerminalDiagnosticCategory},
    help::Help,
    label::Label,
    note::Note,
    severity::Severity,
};

use super::SpecialFormKind;
use crate::node::{
    expr::call::{Argument, LabeledArgument},
    path::{Path, PathSegmentArgument},
};

pub(crate) type SpecialFormExpanderDiagnostic =
    Diagnostic<SpecialFormExpanderDiagnosticCategory, SpanId>;

const UNKNOWN_SPECIAL_FORM: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "unknown-special-form",
    name: "Unknown special form",
};

const SPECIAL_FORM_ARGUMENT_LENGTH: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "special-form-argument-length",
    name: "Incorrect number of arguments for special form",
};

const LABELED_ARGUMENTS_NOT_SUPPORTED: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "labeled-arguments-not-supported",
    name: "Labeled arguments not supported in special forms",
};

const INVALID_TYPE_EXPRESSION: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "invalid-type-expression",
    name: "Invalid type expression",
};

const INVALID_TYPE_CALL: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "invalid-type-call",
    name: "Invalid function call in type expression",
};

const UNSUPPORTED_TYPE_CONSTRUCTOR: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "unsupported-type-constructor",
    name: "Unsupported type constructor",
};

const INVALID_BINDING_NAME: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "invalid-binding-name",
    name: "Invalid binding name",
};

const QUALIFIED_BINDING_NAME: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "qualified-binding-name",
    name: "Qualified path used as binding name",
};

const TYPE_WITH_EXISTING_ANNOTATION: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "type-with-existing-annotation",
    name: "Type expression with redundant type annotation",
};

const INVALID_USE_IMPORT: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "invalid-use-import",
    name: "Invalid use import expression",
};

const USE_PATH_WITH_GENERICS: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "use-path-with-generics",
    name: "Use path with generic arguments",
};

const FN_GENERICS_WITH_TYPE_ANNOTATION: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "fn-generics-with-type-annotation",
    name: "Function generics with type annotation",
};

const INVALID_FN_GENERICS_EXPRESSION: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "invalid-fn-generics-expression",
    name: "Invalid expression in function generics",
};

const INVALID_FN_PARAMS_EXPRESSION: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "invalid-fn-params-expression",
    name: "Invalid expression in function parameters",
};

const FN_PARAMS_WITH_TYPE_ANNOTATION: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "fn-params-with-type-annotation",
    name: "Function parameters with type annotation",
};

const INVALID_FN_GENERIC_PARAM: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "invalid-fn-generic-param",
    name: "Invalid generic parameter in function declaration",
};

const INVALID_GENERIC_ARGUMENT_PATH: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "invalid-generic-argument-path",
    name: "Invalid path in generic argument",
};

const INVALID_GENERIC_ARGUMENT_TYPE: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "invalid-generic-argument-type",
    name: "Invalid type in generic argument",
};

const DUPLICATE_GENERIC_CONSTRAINT: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "duplicate-generic-constraint",
    name: "Duplicate generic parameter constraint",
};

const DUPLICATE_CLOSURE_PARAMETER: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "duplicate-closure-parameter",
    name: "Duplicate closure parameter",
};

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum SpecialFormExpanderDiagnosticCategory {
    UnknownSpecialForm,
    SpecialFormArgumentLength,
    LabeledArgumentsNotSupported,
    InvalidTypeExpression,
    InvalidTypeCall,
    UnsupportedTypeConstructor,
    InvalidBindingName,
    QualifiedBindingName,
    TypeWithExistingAnnotation,
    InvalidUseImport,
    UsePathWithGenerics,
    FnGenericsWithTypeAnnotation,
    InvalidFnGenericsExpression,
    InvalidFnParamsExpression,
    FnParamsWithTypeAnnotation,
    InvalidFnGenericParam,
    InvalidGenericArgumentPath,
    InvalidGenericArgumentType,
    DuplicateGenericConstraint,
    DuplicateClosureParameter,
}

impl DiagnosticCategory for SpecialFormExpanderDiagnosticCategory {
    fn id(&self) -> Cow<'_, str> {
        Cow::Borrowed("special-form-expander")
    }

    fn name(&self) -> Cow<'_, str> {
        Cow::Borrowed("Special Form Expander")
    }

    fn subcategory(&self) -> Option<&dyn DiagnosticCategory> {
        match self {
            Self::UnknownSpecialForm => Some(&UNKNOWN_SPECIAL_FORM),
            Self::SpecialFormArgumentLength => Some(&SPECIAL_FORM_ARGUMENT_LENGTH),
            Self::LabeledArgumentsNotSupported => Some(&LABELED_ARGUMENTS_NOT_SUPPORTED),
            Self::InvalidTypeExpression => Some(&INVALID_TYPE_EXPRESSION),
            Self::InvalidTypeCall => Some(&INVALID_TYPE_CALL),
            Self::UnsupportedTypeConstructor => Some(&UNSUPPORTED_TYPE_CONSTRUCTOR),
            Self::InvalidBindingName => Some(&INVALID_BINDING_NAME),
            Self::QualifiedBindingName => Some(&QUALIFIED_BINDING_NAME),
            Self::TypeWithExistingAnnotation => Some(&TYPE_WITH_EXISTING_ANNOTATION),
            Self::InvalidUseImport => Some(&INVALID_USE_IMPORT),
            Self::UsePathWithGenerics => Some(&USE_PATH_WITH_GENERICS),
            Self::FnGenericsWithTypeAnnotation => Some(&FN_GENERICS_WITH_TYPE_ANNOTATION),
            Self::InvalidFnGenericsExpression => Some(&INVALID_FN_GENERICS_EXPRESSION),
            Self::InvalidFnParamsExpression => Some(&INVALID_FN_PARAMS_EXPRESSION),
            Self::FnParamsWithTypeAnnotation => Some(&FN_PARAMS_WITH_TYPE_ANNOTATION),
            Self::InvalidFnGenericParam => Some(&INVALID_FN_GENERIC_PARAM),
            Self::InvalidGenericArgumentPath => Some(&INVALID_GENERIC_ARGUMENT_PATH),
            Self::InvalidGenericArgumentType => Some(&INVALID_GENERIC_ARGUMENT_TYPE),
            Self::DuplicateGenericConstraint => Some(&DUPLICATE_GENERIC_CONSTRAINT),
            Self::DuplicateClosureParameter => Some(&DUPLICATE_CLOSURE_PARAMETER),
        }
    }
}

pub(crate) fn unknown_special_form_length(
    span: SpanId,
    path: &Path<'_>,
) -> SpecialFormExpanderDiagnostic {
    let mut diagnostic = Diagnostic::new(
        SpecialFormExpanderDiagnosticCategory::UnknownSpecialForm,
        Severity::Error,
    );

    diagnostic
        .labels
        .push(Label::new(span, "Fix this path to have exactly 3 segments"));

    if path.segments.len() > 3 {
        // Point to the problematic segment(s)
        #[expect(clippy::cast_possible_truncation, clippy::cast_possible_wrap)]
        for (index, segment) in path.segments.iter().enumerate().skip(3) {
            diagnostic.labels.push(
                Label::new(segment.span, "Remove this extra segment")
                    .with_order(-(index as i32 + 2)),
            );
        }
    }

    diagnostic.add_help(Help::new(
        "Special form paths must follow the pattern '::kernel::special_form::<name>' with exactly \
         3 segments",
    ));

    diagnostic.add_note(Note::new(format!(
        "Found path with {} segments, but special form paths must have exactly 3 segments",
        path.segments.len()
    )));

    diagnostic
}

pub(crate) fn unknown_special_form_name(
    span: SpanId,
    path: &Path<'_>,
) -> SpecialFormExpanderDiagnostic {
    let mut diagnostic = Diagnostic::new(
        SpecialFormExpanderDiagnosticCategory::UnknownSpecialForm,
        Severity::Error,
    );

    let function_name = path.segments[2].name.value;
    let function_span = path.segments[2].name.span;

    diagnostic.labels.push(Label::new(
        function_span,
        format!("Replace '{function_name}' with a valid special form name"),
    ));

    diagnostic
        .labels
        .push(Label::new(span, "This special form path is invalid").with_order(1));

    let mut closest_match = did_you_mean(
        function_name,
        enum_iterator::all::<SpecialFormKind>()
            .map(|kind| path.segments.allocator().intern_symbol(kind.as_str())),
        Some(1),
        None,
    );

    let help = closest_match.pop().map_or(
        Cow::Borrowed("Special forms must use one of the predefined names shown in the note below"),
        |kind| Cow::Owned(format!("Did you mean to use '{kind}' instead?")),
    );

    diagnostic.add_help(Help::new(help));

    let names = enum_iterator::all::<SpecialFormKind>()
        .map(SpecialFormKind::as_str)
        .collect::<Vec<_>>()
        .join(", ");

    diagnostic.add_note(Note::new(format!(
        "Available special forms include: {names}"
    )));

    diagnostic
}

pub(crate) fn unknown_special_form_generics(
    generics: &[&PathSegmentArgument],
) -> SpecialFormExpanderDiagnostic {
    let mut diagnostic = Diagnostic::new(
        SpecialFormExpanderDiagnosticCategory::UnknownSpecialForm,
        Severity::Error,
    );

    let (first, rest) = generics
        .split_first()
        .expect("should have at least one generic argument");

    diagnostic
        .labels
        .push(Label::new(first.span(), "Remove these generic arguments"));

    #[expect(clippy::cast_possible_truncation, clippy::cast_possible_wrap)]
    for (index, arg) in rest.iter().enumerate() {
        diagnostic
            .labels
            .push(Label::new(arg.span(), "... and these too").with_order((index + 1) as i32));
    }

    diagnostic.add_help(Help::new(
        "Special form paths must not include generic arguments. Remove the angle brackets and \
         their contents.",
    ));

    diagnostic.add_note(Note::new(
        "Special forms are built-in language constructs that don't support generics in their path \
         reference.",
    ));

    diagnostic
}

pub(super) fn invalid_argument_length(
    span: SpanId,
    kind: SpecialFormKind,
    arguments: &[Argument],
    expected: &[usize],
) -> SpecialFormExpanderDiagnostic {
    let mut diagnostic = Diagnostic::new(
        SpecialFormExpanderDiagnosticCategory::SpecialFormArgumentLength,
        Severity::Error,
    );

    let actual = arguments.len();

    let canonical: Vec<_> = expected
        .iter()
        .map(|length| format!("{kind}/{length}"))
        .collect();

    let max_expected = expected.iter().max().copied().unwrap_or(0);

    #[expect(clippy::cast_possible_truncation, clippy::cast_possible_wrap)]
    if actual > max_expected {
        let excess = &arguments[max_expected..];

        let (first, rest) = excess.split_first().unwrap_or_else(|| unreachable!());

        diagnostic
            .labels
            .push(Label::new(first.span, "Remove this argument"));

        for (index, argument) in rest.iter().enumerate() {
            diagnostic.labels.push(
                Label::new(argument.span, "... and this argument").with_order(-(index as i32 + 1)),
            );
        }

        diagnostic.labels.push(
            Label::new(span, format!("In this `{kind}` special form call"))
                .with_order(-((actual + 1) as i32)),
        );
    } else {
        diagnostic
            .labels
            .push(Label::new(span, "Add missing arguments"));
    }

    // Specific help text with code examples
    let help_text = match kind {
        SpecialFormKind::If => {
            "Use either:\n- if/2: (if condition then-expr)\n- if/3: (if condition then-expr \
             else-expr)"
        }
        SpecialFormKind::As => "The as/2 form should look like: (as value type-expr)",
        SpecialFormKind::Let => {
            "Use either:\n- let/3: (let name value body)\n- let/4: (let name type value body)"
        }
        SpecialFormKind::Type => "The type/3 form should look like: (type name type-expr body)",
        SpecialFormKind::Newtype => {
            "The newtype/3 form should look like: (newtype name type-expr body)"
        }
        SpecialFormKind::Use => "The use/3 form should look like: (use module imports body)",
        SpecialFormKind::Fn => {
            "The fn/4 form should look like: (fn generics arguments return-type body)"
        }
        SpecialFormKind::Input => {
            "Use either:\n- input/2: (input name type)\n- input/3: (input name type default)"
        }
        SpecialFormKind::Access => "The access/2 form should look like: (. object field)",
        SpecialFormKind::Index => "The index/2 form should look like: ([] object index)",
    };

    diagnostic.add_help(Help::new(help_text));

    diagnostic.add_note(Note::new(format!(
        "The {kind} function has {} variant{}: {}",
        expected.len(),
        if expected.len() == 1 { "" } else { "s" },
        canonical.join(", ")
    )));

    diagnostic
}

pub(crate) fn labeled_arguments_not_supported(
    span: SpanId,
    arguments: &[LabeledArgument],
) -> SpecialFormExpanderDiagnostic {
    let mut diagnostic = Diagnostic::new(
        SpecialFormExpanderDiagnosticCategory::LabeledArgumentsNotSupported,
        Severity::Error,
    );

    diagnostic
        .labels
        .push(Label::new(span, "In this special form call"));

    let (first, rest) = arguments.split_first().unwrap_or_else(|| unreachable!());

    diagnostic
        .labels
        .push(Label::new(first.span, "Remove this labeled argument"));

    #[expect(clippy::cast_possible_truncation, clippy::cast_possible_wrap)]
    for (index, argument) in rest.iter().enumerate() {
        diagnostic.labels.push(
            Label::new(argument.span, "... and this labeled argument")
                .with_order(-(index as i32 - 1)),
        );
    }

    diagnostic.add_help(Help::new(
        "Special forms only accept positional arguments. Convert all labeled arguments to \
         positional arguments in the correct order.",
    ));

    diagnostic.add_note(Note::new(
        "Unlike regular functions, special forms have fixed parameter positions and cannot use \
         labeled arguments.",
    ));

    diagnostic
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub(crate) enum InvalidTypeExpressionKind {
    Dict,
    List,
    Literal,
    Let,
    Type,
    NewType,
    Use,
    Input,
    Closure,
    If,
    Field,
    Index,
    As,
    Dummy,
}

impl InvalidTypeExpressionKind {
    const fn as_str(self) -> &'static str {
        match self {
            Self::Dict => "dictionary",
            Self::List => "list",
            Self::Literal => "literal",
            Self::Let => "let binding",
            Self::Type => "type definition",
            Self::NewType => "newtype definition",
            Self::Use => "use",
            Self::Input => "input",
            Self::Closure => "function",
            Self::If => "if",
            Self::Field => "field access",
            Self::Index => "index",
            Self::As => "as",
            Self::Dummy => "dummy",
        }
    }
}

impl Display for InvalidTypeExpressionKind {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.write_str(self.as_str())
    }
}

const TYPE_EXPRESSION_NOTE: &str = "Valid type expressions include:
- Type names: String, Int, Float
- Struct types: {name: String, age: Int}
- Tuple types: (String, Int, Boolean)
- Unions: (| String Int)
- Intersections: (& String Int)
- Generic types: Array<String>, Option<Int>";

pub(crate) fn invalid_type_expression(
    span: SpanId,
    kind: InvalidTypeExpressionKind,
) -> SpecialFormExpanderDiagnostic {
    let mut diagnostic = Diagnostic::new(
        SpecialFormExpanderDiagnosticCategory::InvalidTypeExpression,
        Severity::Error,
    );

    let message = match kind {
        InvalidTypeExpressionKind::Literal => {
            Cow::Borrowed("Replace this literal with a type name")
        }
        InvalidTypeExpressionKind::If => {
            Cow::Borrowed("Replace this conditional with a concrete type")
        }
        InvalidTypeExpressionKind::Dict
        | InvalidTypeExpressionKind::List
        | InvalidTypeExpressionKind::Let
        | InvalidTypeExpressionKind::Type
        | InvalidTypeExpressionKind::NewType
        | InvalidTypeExpressionKind::Use
        | InvalidTypeExpressionKind::Input
        | InvalidTypeExpressionKind::Closure
        | InvalidTypeExpressionKind::Field
        | InvalidTypeExpressionKind::Index
        | InvalidTypeExpressionKind::As
        | InvalidTypeExpressionKind::Dummy => {
            Cow::Owned(format!("Replace this {kind} with a proper type expression"))
        }
    };

    diagnostic.labels.push(Label::new(span, message));

    let help_text = match kind {
        InvalidTypeExpressionKind::Dict => {
            "Dictionaries do not constitute a valid type expression, did you mean to instantiate a \
             struct type or refer to the `Dict<K, V>` type?"
        }
        InvalidTypeExpressionKind::List => {
            "Arrays do not constitute a valid type expression, did you mean to instantiate a tuple \
             type or refer to the `Array<T>` type?"
        }
        InvalidTypeExpressionKind::If => {
            "HashQL does not support conditional types. Use a concrete type like Int or String."
        }
        InvalidTypeExpressionKind::Literal
        | InvalidTypeExpressionKind::Let
        | InvalidTypeExpressionKind::Type
        | InvalidTypeExpressionKind::NewType
        | InvalidTypeExpressionKind::Use
        | InvalidTypeExpressionKind::Input
        | InvalidTypeExpressionKind::Closure
        | InvalidTypeExpressionKind::Field
        | InvalidTypeExpressionKind::Index
        | InvalidTypeExpressionKind::As
        | InvalidTypeExpressionKind::Dummy => {
            "Replace this expression with a valid type reference, struct type, or tuple type"
        }
    };

    diagnostic.add_help(Help::new(help_text));

    diagnostic.add_note(Note::new(TYPE_EXPRESSION_NOTE));

    diagnostic
}

pub(crate) fn invalid_type_call_function(span: SpanId) -> SpecialFormExpanderDiagnostic {
    let mut diagnostic = Diagnostic::new(
        SpecialFormExpanderDiagnosticCategory::InvalidTypeExpression,
        Severity::Error,
    );

    diagnostic.labels.push(Label::new(
        span,
        "Function call with non-path callee cannot be used as a type",
    ));

    diagnostic.add_help(Help::new(
        "Only specific type constructors like intersection (&) and union (|) operators can be \
         used in type expressions.",
    ));

    diagnostic.add_note(Note::new(TYPE_EXPRESSION_NOTE));

    diagnostic
}

pub(crate) fn unsupported_type_constructor_function(span: SpanId) -> SpecialFormExpanderDiagnostic {
    let mut diagnostic = Diagnostic::new(
        SpecialFormExpanderDiagnosticCategory::InvalidTypeExpression,
        Severity::Error,
    );

    diagnostic.labels.push(Label::new(
        span,
        "This function cannot be used as a type constructor",
    ));

    diagnostic.add_help(Help::new(
        "Only specific type constructors like intersection (&) and union (|) operators can be \
         used in type expressions.",
    ));

    diagnostic.add_note(Note::new(
        "Currently supported type operations are:\n- Intersection: math::bit_and (written as & in \
         source)\n- Union: math::bit_or (written as | in source)",
    ));

    diagnostic
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash, derive_more::Display)]
pub(crate) enum BindingMode {
    #[display("use")]
    Use,
    #[display("let")]
    Let,
    #[display("type")]
    Type,
    #[display("newtype")]
    Newtype,
    #[display("input")]
    Input,
    #[display("`.`")]
    Access,
}

pub(crate) fn invalid_binding_name_not_path(
    span: SpanId,
    mode: BindingMode,
) -> SpecialFormExpanderDiagnostic {
    let mut diagnostic = Diagnostic::new(
        SpecialFormExpanderDiagnosticCategory::InvalidBindingName,
        Severity::Error,
    );

    diagnostic.labels.push(Label::new(
        span,
        "Replace this expression with a simple identifier",
    ));

    diagnostic.add_help(Help::new(format!(
        "The {mode} binding name must be a simple identifier. Complex expressions are not allowed \
         in binding positions."
    )));

    let note = match mode {
        BindingMode::Use => {
            "Valid examples of use bindings:\n- (use module_name * body)\n- (use ::math (sin, cos) \
             ...)\n- (use ::string (trim: string_trim) ...)"
        }
        BindingMode::Let => {
            "Valid examples of let bindings:\n- (let x value body)\n- (let counter 0 ...)\n- (let \
             user_name input ...)"
        }
        BindingMode::Type => {
            "Valid examples of type bindings:\n- (type Person (name: String, age: Int) body)\n- \
             (type Output (| Integer Natural) ...)\n- (type UserId String ...)"
        }
        BindingMode::Newtype => {
            "Valid examples of newtype bindings:\n- (newtype UserId String body)\n- (newtype Email \
             String ...)\n- (newtype Percentage Number ...)"
        }
        BindingMode::Input => {
            "Valid examples of input bindings:\n- (input name String)\n- (input age Int \
             default_age)\n- (input options (enabled: Boolean))"
        }
        BindingMode::Access => {
            "Valid examples of access bindings:\n- (. user name)\n- (. person age)\n- (. options \
             enabled)"
        }
    };

    diagnostic.add_note(Note::new(note));

    diagnostic
}

pub(crate) fn invalid_let_name_qualified_path(
    span: SpanId,
    mode: BindingMode,
) -> SpecialFormExpanderDiagnostic {
    let mut diagnostic = Diagnostic::new(
        SpecialFormExpanderDiagnosticCategory::QualifiedBindingName,
        Severity::Error,
    );

    diagnostic
        .labels
        .push(Label::new(span, "Replace this with a simple identifier"));

    diagnostic.add_help(Help::new(format!(
        "{mode} binding names must be simple identifiers without any path qualification. \
         Qualified paths cannot be used as binding names."
    )));

    diagnostic.add_note(Note::new(
        "Valid identifiers are simple names like 'x', 'counter', '+', or 'user_name' without any \
         namespace qualification, generic parameters, or path separators.",
    ));

    diagnostic
}

pub(crate) fn invalid_type_name_qualified_path(
    span: SpanId,
    mode: BindingMode,
) -> SpecialFormExpanderDiagnostic {
    let mut diagnostic = Diagnostic::new(
        SpecialFormExpanderDiagnosticCategory::QualifiedBindingName,
        Severity::Error,
    );

    diagnostic.labels.push(Label::new(
        span,
        "Replace this qualified path with a simple identifier",
    ));

    diagnostic.add_help(Help::new(format!(
        "The {mode} binding requires a simple type name (like 'String' or 'MyType<T>'), not a \
         qualified path (like 'std::string::String'). Remove the path segments."
    )));

    diagnostic.add_note(Note::new(
        "Valid type names are simple identifiers, optionally followed by generic arguments (e.g., \
         'Identifier' or 'Container<Param>'). They cannot contain '::' path separators in this \
         context.",
    ));

    diagnostic
}

pub(crate) fn type_with_existing_annotation(span: SpanId) -> SpecialFormExpanderDiagnostic {
    let mut diagnostic = Diagnostic::new(
        SpecialFormExpanderDiagnosticCategory::TypeWithExistingAnnotation,
        Severity::Error,
    );

    diagnostic
        .labels
        .push(Label::new(span, "Remove this type annotation"));

    diagnostic.add_help(Help::new(
        "Type expressions used in special forms cannot have their own type annotations. The \
         expression itself defines a type and cannot be annotated with another type.",
    ));

    diagnostic.add_note(Note::new(
        "When constructing type expressions for special forms like 'type', 'newtype', or 'as', \
         the expression itself represents a type definition and cannot have a separate type \
         annotation.",
    ));

    diagnostic
}

pub(crate) fn invalid_use_import(span: SpanId) -> SpecialFormExpanderDiagnostic {
    let mut diagnostic = Diagnostic::new(
        SpecialFormExpanderDiagnosticCategory::InvalidUseImport,
        Severity::Error,
    );

    diagnostic
        .labels
        .push(Label::new(span, "Replace with a valid import expression"));

    diagnostic.add_help(Help::new(
        "Use imports must be either a glob (*), a tuple of identifiers, or a struct of bindings. \
         Other expression types are not valid in this context.",
    ));

    diagnostic.add_note(Note::new(
        "Valid import expressions include:\n- Glob: *\n- Tuple of identifiers: (name1, name2)\n- \
         Struct with aliases: (name1: alias1, name2: alias2) or (name1: _, name2: _)",
    ));

    diagnostic
}

pub(crate) fn use_imports_with_type_annotation(span: SpanId) -> SpecialFormExpanderDiagnostic {
    let mut diagnostic = Diagnostic::new(
        SpecialFormExpanderDiagnosticCategory::InvalidUseImport,
        Severity::Error,
    );

    diagnostic
        .labels
        .push(Label::new(span, "Remove this type annotation"));

    diagnostic.add_help(Help::new(
        "Use import expressions cannot have type annotations. Import expressions define which \
         symbols to import, and do not have a meaningful type in this context.",
    ));

    diagnostic.add_note(Note::new(
        "Import expressions in the 'use' special form can only be a glob (*), a tuple of \
         identifiers, or a struct of bindings, none of which should have type annotations.",
    ));

    diagnostic
}

pub(crate) fn invalid_path_in_use_binding(span: SpanId) -> SpecialFormExpanderDiagnostic {
    let mut diagnostic = Diagnostic::new(
        SpecialFormExpanderDiagnosticCategory::InvalidUseImport,
        Severity::Error,
    );

    diagnostic
        .labels
        .push(Label::new(span, "Use a simple identifier here"));

    diagnostic.add_help(Help::new(
        "Use binding names must be simple identifiers. Qualified paths or complex expressions \
         cannot be used in this context.",
    ));

    diagnostic.add_note(Note::new(
        "In tuple imports, each element must be a simple identifier. For example: (name1, name2) \
         is valid, but (path::to::name,) is not.",
    ));

    diagnostic
}

pub(crate) fn use_path_with_generics(
    span: SpanId,
    path: &Path<'_>,
) -> SpecialFormExpanderDiagnostic {
    let mut diagnostic = Diagnostic::new(
        SpecialFormExpanderDiagnosticCategory::UsePathWithGenerics,
        Severity::Error,
    );

    diagnostic
        .labels
        .push(Label::new(span, "Remove these generic arguments"));

    // Add labels for each generic argument segment in the path
    for (index, segment) in path.segments.iter().enumerate() {
        if !segment.arguments.is_empty() {
            #[expect(clippy::cast_possible_truncation, clippy::cast_possible_wrap)]
            diagnostic.labels.push(
                Label::new(segment.span, "Generic arguments are not allowed here")
                    .with_order(-((index + 1) as i32)),
            );
        }
    }

    diagnostic.add_help(Help::new(
        "The 'use' special form does not support generic arguments in import paths. Remove all \
         generic arguments from the path.",
    ));

    diagnostic.add_note(Note::new(
        "Use statements in HashQL can only import modules or specific symbols, but cannot specify \
         generic parameters during import.",
    ));

    diagnostic
}

pub(crate) fn fn_generics_with_type_annotation(span: SpanId) -> SpecialFormExpanderDiagnostic {
    let mut diagnostic = Diagnostic::new(
        SpecialFormExpanderDiagnosticCategory::FnGenericsWithTypeAnnotation,
        Severity::Error,
    );

    diagnostic
        .labels
        .push(Label::new(span, "Remove this type annotation"));

    diagnostic.add_help(Help::new(
        "Function generics declarations cannot have type annotations. Generic parameter lists \
         define type parameters for the function, and do not have a meaningful type themselves.",
    ));

    diagnostic.add_note(Note::new(
        "In the 'fn' special form, the generics argument should be either a tuple of identifiers \
         such as (T, U) or a struct of bounded type parameters such as (T: SomeBound, U: \
         OtherBound, V: _), where an underscore indicates no bound.",
    ));

    diagnostic
}

pub(crate) fn invalid_fn_generics_expression(span: SpanId) -> SpecialFormExpanderDiagnostic {
    let mut diagnostic = Diagnostic::new(
        SpecialFormExpanderDiagnosticCategory::InvalidFnGenericsExpression,
        Severity::Error,
    );

    diagnostic
        .labels
        .push(Label::new(span, "Use a valid generics expression"));

    diagnostic.add_help(Help::new(
        "Function generics must be specified as either a tuple of identifiers or a struct of \
         bounded type parameters. Other expression types are not valid in this context.",
    ));

    diagnostic.add_note(Note::new(
        "Valid generics expressions include:\n- Empty: ()\n- Tuple of identifiers: (T, U, V)\n- \
         Struct with bounds: (T: SomeBound, U: OtherBound) or (T: _, U: _) for unbounded types",
    ));

    diagnostic
}

pub(crate) fn invalid_fn_generic_param(span: SpanId) -> SpecialFormExpanderDiagnostic {
    let mut diagnostic = Diagnostic::new(
        SpecialFormExpanderDiagnosticCategory::InvalidFnGenericParam,
        Severity::Error,
    );

    diagnostic
        .labels
        .push(Label::new(span, "Use a simple identifier here"));

    diagnostic.add_help(Help::new(
        "Generic type parameters must be simple identifiers. Qualified paths or complex \
         expressions cannot be used in this context.",
    ));

    diagnostic.add_note(Note::new(
        "In function generic parameter lists, each element must be a simple identifier. For \
         example: (T, U, V) is valid, but (some::path,) is not.",
    ));

    diagnostic
}

pub(crate) fn fn_params_with_type_annotation(span: SpanId) -> SpecialFormExpanderDiagnostic {
    let mut diagnostic = Diagnostic::new(
        SpecialFormExpanderDiagnosticCategory::FnParamsWithTypeAnnotation,
        Severity::Error,
    );

    diagnostic
        .labels
        .push(Label::new(span, "Remove this type annotation"));

    diagnostic.add_help(Help::new(
        "Function parameter declarations cannot have type annotations at the struct level. The \
         struct itself represents the parameter list, and each field represents a parameter with \
         its type.",
    ));

    diagnostic.add_note(Note::new(
        "In the 'fn' special form, parameter lists should be structured as (param1: Type1, \
         param2: Type2), where the struct itself does not have a type annotation.",
    ));

    diagnostic
}

pub(crate) fn invalid_fn_params_expression(span: SpanId) -> SpecialFormExpanderDiagnostic {
    let mut diagnostic = Diagnostic::new(
        SpecialFormExpanderDiagnosticCategory::InvalidFnParamsExpression,
        Severity::Error,
    );

    diagnostic
        .labels
        .push(Label::new(span, "Use a struct expression for parameters"));

    diagnostic.add_help(Help::new(
        "Function parameters must be specified as a struct where field names are parameter names \
         and field values are parameter types. Other expression types are not valid in this \
         context.",
    ));

    diagnostic.add_note(Note::new(
        "Valid parameter expression is a struct in the form: (param1: Type1, param2: Type2, ...)",
    ));

    diagnostic
}

pub(crate) fn invalid_generic_argument_path(span: SpanId) -> SpecialFormExpanderDiagnostic {
    let mut diagnostic = Diagnostic::new(
        SpecialFormExpanderDiagnosticCategory::InvalidGenericArgumentPath,
        Severity::Error,
    );

    diagnostic
        .labels
        .push(Label::new(span, "Replace with a simple identifier"));

    diagnostic.add_help(Help::new(
        "Generic arguments must be simple identifiers. Qualified paths cannot be used as generic \
         arguments in this context.",
    ));

    diagnostic.add_note(Note::new(
        "In generic parameter constraints, arguments should be simple identifiers like 'T', 'U', \
         or 'Element' without namespace qualification or path separators.",
    ));

    diagnostic
}

pub(crate) fn invalid_generic_argument_type(span: SpanId) -> SpecialFormExpanderDiagnostic {
    let mut diagnostic = Diagnostic::new(
        SpecialFormExpanderDiagnosticCategory::InvalidGenericArgumentType,
        Severity::Error,
    );

    diagnostic
        .labels
        .push(Label::new(span, "Use a simple type identifier here"));

    diagnostic.add_help(Help::new(
        "Generic argument types must be simple path identifiers. Complex types like structs, \
         tuples, or function types cannot be used as generic argument types in this context.",
    ));

    diagnostic.add_note(Note::new(
        "Valid generic argument types are simple identifiers that refer to type names, such as \
         'String', 'Number', or type parameters like 'T'.",
    ));

    diagnostic
}

pub(crate) fn duplicate_generic_constraint(
    span: SpanId,
    param: &str,
    original_span: SpanId,
) -> SpecialFormExpanderDiagnostic {
    let mut diagnostic = Diagnostic::new(
        SpecialFormExpanderDiagnosticCategory::DuplicateGenericConstraint,
        Severity::Error,
    );

    diagnostic.labels.push(Label::new(
        span,
        format!("Remove this duplicate declaration of '{param}'"),
    ));

    diagnostic.labels.push(
        Label::new(
            original_span,
            format!("'{param}' was previously declared here"),
        )
        .with_order(1),
    );

    diagnostic.add_help(Help::new(
        "Each generic parameter can only be declared once in a function or type definition. \
         Remove the duplicate declaration or use a different name.",
    ));

    diagnostic.add_note(Note::new(
        "Generic parameter names must be unique within a single generic parameter list. For \
         example, in foo<T: Bound, U: OtherBound>, 'T' and 'U' are unique parameters.",
    ));

    diagnostic
}

pub(crate) fn duplicate_closure_parameter(
    span: SpanId,
    param: &str,
    original_span: SpanId,
) -> SpecialFormExpanderDiagnostic {
    let mut diagnostic = Diagnostic::new(
        SpecialFormExpanderDiagnosticCategory::DuplicateClosureParameter,
        Severity::Error,
    );

    diagnostic.labels.push(Label::new(
        span,
        format!("Remove this duplicate parameter '{param}'"),
    ));

    diagnostic.labels.push(
        Label::new(
            original_span,
            format!("'{param}' was previously declared here"),
        )
        .with_order(1),
    );

    diagnostic.add_help(Help::new(
        "Each function parameter must have a unique name. Rename this parameter or remove the \
         duplicate declaration.",
    ));

    diagnostic.add_note(Note::new(
        "Function parameters must have unique names within the same parameter list. For example, \
         in fn(x: Int, y: String): ReturnType body), 'x' and 'y' are unique parameters.",
    ));

    diagnostic
}

pub(crate) fn duplicate_closure_generic(
    span: SpanId,
    param_name: &str,
    original_span: SpanId,
) -> SpecialFormExpanderDiagnostic {
    let mut diagnostic = Diagnostic::new(
        SpecialFormExpanderDiagnosticCategory::DuplicateGenericConstraint,
        Severity::Error,
    );

    diagnostic.labels.push(Label::new(
        span,
        format!("Remove this duplicate generic parameter '{param_name}'"),
    ));

    diagnostic.labels.push(
        Label::new(
            original_span,
            format!("'{param_name}' was previously declared here"),
        )
        .with_order(1),
    );

    diagnostic.add_help(Help::new(
        "Each generic parameter can only be declared once in a function definition. Remove the \
         duplicate declaration or use a different name.",
    ));

    diagnostic.add_note(Note::new(
        "Generic parameter names must be unique within a function's generic parameter list. For \
         example, in fn<T, U>(param: T): U -> body), 'T' and 'U' are unique parameters.",
    ));

    diagnostic
}
