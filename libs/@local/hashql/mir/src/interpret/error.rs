use alloc::borrow::Cow;
use core::{
    alloc::Allocator,
    fmt::{self, Display},
};

use hashql_core::{span::SpanId, symbol::Symbol};
use hashql_diagnostics::{
    Diagnostic, Label,
    category::{DiagnosticCategory, TerminalDiagnosticCategory},
    diagnostic::Message,
    severity::Severity,
};
use hashql_hir::node::operation::UnOp;

use super::value::{Ptr, Value, ValueTypeName};
use crate::body::{
    constant::Int,
    local::{Local, LocalDecl},
    place::FieldIndex,
    rvalue::BinOp,
};

pub(crate) type InterpretDiagnostic<K = Severity> =
    Diagnostic<InterpretDiagnosticCategory, SpanId, K>;

// Terminal categories for ICEs
const LOCAL_ACCESS: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "local-access",
    name: "Local Access",
};

const TYPE_INVARIANT: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "type-invariant",
    name: "Type Invariant",
};

const STRUCTURAL_INVARIANT: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "structural-invariant",
    name: "Structural Invariant",
};

const CONTROL_FLOW: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "control-flow",
    name: "Control Flow",
};

// Terminal categories for user-facing errors (some are temporarily Error, will become ICE)
const BOUNDS_CHECK: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "bounds-check",
    name: "Bounds Check",
};

const RUNTIME_LIMIT: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "runtime-limit",
    name: "Runtime Limit",
};

const INPUT_RESOLUTION: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "input-resolution",
    name: "Input Resolution",
};

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum InterpretDiagnosticCategory {
    LocalAccess,
    TypeInvariant,
    StructuralInvariant,
    ControlFlow,
    BoundsCheck,
    RuntimeLimit,
    InputResolution,
}

impl DiagnosticCategory for InterpretDiagnosticCategory {
    fn id(&self) -> Cow<'_, str> {
        Cow::Borrowed("interpret")
    }

    fn name(&self) -> Cow<'_, str> {
        Cow::Borrowed("Interpret")
    }

    fn subcategory(&self) -> Option<&dyn DiagnosticCategory> {
        match self {
            Self::LocalAccess => Some(&LOCAL_ACCESS),
            Self::TypeInvariant => Some(&TYPE_INVARIANT),
            Self::StructuralInvariant => Some(&STRUCTURAL_INVARIANT),
            Self::ControlFlow => Some(&CONTROL_FLOW),
            Self::BoundsCheck => Some(&BOUNDS_CHECK),
            Self::RuntimeLimit => Some(&RUNTIME_LIMIT),
            Self::InputResolution => Some(&INPUT_RESOLUTION),
        }
    }
}

#[derive(Debug, Clone)]
pub enum TypeName {
    Static(Cow<'static, str>),
    Pointer(Ptr),
}

impl TypeName {
    pub const fn terse(str: &'static str) -> Self {
        Self::Static(Cow::Borrowed(str))
    }
}

impl Display for TypeName {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Static(name) => Display::fmt(name, fmt),
            Self::Pointer(ptr) => Display::fmt(ptr, fmt),
        }
    }
}

impl<A: Allocator> From<ValueTypeName<'_, '_, A>> for TypeName {
    fn from(value: ValueTypeName<'_, '_, A>) -> Self {
        value.into_type_name()
    }
}

#[derive(Debug, Clone)]
pub struct BinaryTypeMismatch<'heap> {
    pub op: BinOp,

    pub lhs_expected: TypeName,
    pub rhs_expected: TypeName,

    pub lhs: Value<'heap>,
    pub rhs: Value<'heap>,
}

#[derive(Debug, Clone)]
pub struct UnaryTypeMismatch<'heap> {
    pub op: UnOp,

    pub expected: TypeName,

    pub value: Value<'heap>,
}

#[derive(Debug, Clone)]
pub enum RuntimeError<'heap> {
    // Local hasn't been initialized yet, by all intents and purposes this is an ICE, because
    // *any* step before should have handled this. Be it the MIR or the HIR.
    UninitializedLocal {
        local: Local,
        decl: LocalDecl<'heap>,
    },
    // Again: this is an ICE. typechk should have handled this.
    InvalidIndexType {
        base: TypeName,
        index: TypeName,
    },
    // Again: this is an ICE. typechk should have handled this.
    InvalidSubscriptType {
        base: TypeName,
    },
    // Again: this is an ICE. typechk should have handled this.
    InvalidProjectionType {
        base: TypeName,
    },
    // Again: this is an ICE. typechk should have handled this.
    InvalidProjectionByNameType {
        base: TypeName,
    },
    // Again: this is an ICE. typechk should have handled this.
    UnknownField {
        base: TypeName,
        field: FieldIndex,
    },
    // Again: this is an ICE. typechk should have handled this.
    UnknownFieldByName {
        base: TypeName,
        field: Symbol<'heap>,
    },
    // Again: this is an ICE. This should just... never happen.
    StructFieldLengthMismatch {
        values: usize,
        fields: usize,
    },
    // Again: this is an ICE. This should just... never happen.
    InvalidDiscriminantType {
        r#type: TypeName,
    },
    // Again: this is an ICE. This should just... never happen.
    InvalidDiscriminant {
        value: Int,
    },
    // Again: this is an ICE. This should just... never happen.
    UnreachableReached,
    // Again: this is an ICE. This should just... never happen.
    BinaryTypeMismatch(Box<BinaryTypeMismatch<'heap>>),
    // Again: this is an ICE. This should just... never happen.
    UnaryTypeMismatch(Box<UnaryTypeMismatch<'heap>>),
    // Again: this is an ICE. This should just... never happen.
    ApplyNonPointer {
        r#type: TypeName,
    },
    // Again: this is an ICE. This should just... never happen.
    CallstackEmpty,

    // This is actually a proper error, in a future this should be removed. Potentially ICE
    // because the user can't actually use this, so this would only happen if the compiler
    // determined that it fine to turn into a mutable assignment but then turned out that wasn't
    // the case.
    OutOfRange {
        length: usize,
        index: Int,
    },
    // ICE, should be caught in program analysis, for now just an ERR because program analysis is
    // not yet implemented.
    InputNotFound {
        name: Symbol<'heap>,
    },
    RecursionLimitExceeded {
        limit: usize,
    },
}

impl RuntimeError<'_> {
    /// Converts this runtime error into a diagnostic using the provided callstack.
    ///
    /// The callstack provides span information for error localization. The first
    /// frame's span is used as the primary label, and subsequent frames are added
    /// as secondary labels to show the call trace.
    pub fn into_diagnostic(
        self,
        callstack: impl IntoIterator<Item = SpanId>,
    ) -> InterpretDiagnostic {
        let mut spans = callstack.into_iter();
        let primary_span = spans.next().unwrap_or(SpanId::SYNTHETIC);

        let mut diagnostic = self.make_diagnostic(primary_span);

        // Add callstack frames as secondary labels
        for span in spans {
            diagnostic.add_label(Label::new(span, "called from here"));
        }

        diagnostic
    }

    fn make_diagnostic(self, span: SpanId) -> InterpretDiagnostic {
        match self {
            Self::UninitializedLocal { local, decl } => uninitialized_local(span, local, decl),
            Self::InvalidIndexType { base, index } => invalid_index_type(span, &base, &index),
            Self::InvalidSubscriptType { base } => invalid_subscript_type(span, &base),
            Self::InvalidProjectionType { base } => invalid_projection_type(span, &base),
            Self::InvalidProjectionByNameType { base } => {
                invalid_projection_by_name_type(span, &base)
            }
            Self::UnknownField { base, field } => unknown_field(span, &base, field),
            Self::UnknownFieldByName { base, field } => unknown_field_by_name(span, &base, field),
            Self::StructFieldLengthMismatch { values, fields } => {
                struct_field_length_mismatch(span, values, fields)
            }
            Self::InvalidDiscriminantType { r#type } => invalid_discriminant_type(span, &r#type),
            Self::InvalidDiscriminant { value } => invalid_discriminant(span, value),
            Self::UnreachableReached => unreachable_reached(span),
            Self::BinaryTypeMismatch(mismatch) => binary_type_mismatch(span, *mismatch),
            Self::UnaryTypeMismatch(mismatch) => unary_type_mismatch(span, *mismatch),
            Self::ApplyNonPointer { r#type } => apply_non_pointer(span, &r#type),
            Self::CallstackEmpty => callstack_empty(span),
            Self::OutOfRange { length, index } => out_of_range(span, length, index),
            Self::InputNotFound { name } => input_not_found(span, name),
            Self::RecursionLimitExceeded { limit } => recursion_limit_exceeded(span, limit),
        }
    }
}

#[coverage(off)]
fn uninitialized_local(span: SpanId, local: Local, decl: LocalDecl) -> InterpretDiagnostic {
    let name = core::fmt::from_fn(|fmt| {
        if let Some(symbol) = decl.name {
            Display::fmt(&symbol, fmt)
        } else {
            Display::fmt(&local, fmt)
        }
    });

    let mut diagnostic =
        Diagnostic::new(InterpretDiagnosticCategory::LocalAccess, Severity::Bug).primary(
            Label::new(span, format!("local `{name}` used before initialization")),
        );

    diagnostic.add_label(Label::new(decl.span, "local declared here"));

    diagnostic.add_message(Message::help(
        "MIR construction should ensure all locals are initialized before use",
    ));

    diagnostic
}

// =============================================================================
// ICE: Type Invariant
// =============================================================================

#[coverage(off)]
fn invalid_index_type(span: SpanId, base: &TypeName, index: &TypeName) -> InterpretDiagnostic {
    let mut diagnostic =
        Diagnostic::new(InterpretDiagnosticCategory::TypeInvariant, Severity::Bug).primary(
            Label::new(span, format!("cannot index `{base}` with `{index}`")),
        );

    diagnostic.add_message(Message::help(
        "type checking should have ensured valid index types",
    ));

    diagnostic
}

#[coverage(off)]
fn invalid_subscript_type(span: SpanId, base: &TypeName) -> InterpretDiagnostic {
    let mut diagnostic = Diagnostic::new(InterpretDiagnosticCategory::TypeInvariant, Severity::Bug)
        .primary(Label::new(span, format!("cannot subscript `{base}`")));

    diagnostic.add_message(Message::help(
        "type checking should have ensured only subscriptable types are subscripted",
    ));

    diagnostic
}

#[coverage(off)]
fn invalid_projection_type(span: SpanId, base: &TypeName) -> InterpretDiagnostic {
    let mut diagnostic =
        Diagnostic::new(InterpretDiagnosticCategory::TypeInvariant, Severity::Bug).primary(
            Label::new(span, format!("cannot project field from `{base}`")),
        );

    diagnostic.add_message(Message::help(
        "type checking should have ensured only projectable types are projected",
    ));

    diagnostic
}

#[coverage(off)]
fn invalid_projection_by_name_type(span: SpanId, base: &TypeName) -> InterpretDiagnostic {
    let mut diagnostic =
        Diagnostic::new(InterpretDiagnosticCategory::TypeInvariant, Severity::Bug).primary(
            Label::new(span, format!("cannot project named field from `{base}`")),
        );

    diagnostic.add_message(Message::help(
        "type checking should have ensured only struct types are projected by name",
    ));

    diagnostic
}

#[coverage(off)]
fn unknown_field(span: SpanId, base: &TypeName, field: FieldIndex) -> InterpretDiagnostic {
    let mut diagnostic = Diagnostic::new(InterpretDiagnosticCategory::TypeInvariant, Severity::Bug)
        .primary(Label::new(
            span,
            format!("field index {field} does not exist on `{base}`"),
        ));

    diagnostic.add_message(Message::help(
        "type checking should have ensured field indices are valid",
    ));

    diagnostic
}

#[coverage(off)]
fn unknown_field_by_name(span: SpanId, base: &TypeName, field: Symbol) -> InterpretDiagnostic {
    let mut diagnostic =
        Diagnostic::new(InterpretDiagnosticCategory::TypeInvariant, Severity::Bug).primary(
            Label::new(span, format!("field `{field}` does not exist on `{base}`")),
        );

    diagnostic.add_message(Message::help(
        "type checking should have ensured field names are valid",
    ));

    diagnostic
}

#[coverage(off)]
fn invalid_discriminant_type(span: SpanId, r#type: &TypeName) -> InterpretDiagnostic {
    let mut diagnostic = Diagnostic::new(InterpretDiagnosticCategory::TypeInvariant, Severity::Bug)
        .primary(Label::new(
            span,
            format!("switch discriminant has type `{type}`, expected `Integer`"),
        ));

    diagnostic.add_message(Message::help(
        "type checking should have ensured discriminants are integers",
    ));

    diagnostic
}

#[coverage(off)]
fn binary_type_mismatch(span: SpanId, mismatch: BinaryTypeMismatch) -> InterpretDiagnostic {
    let BinaryTypeMismatch {
        op,
        lhs_expected,
        rhs_expected,
        lhs,
        rhs,
    } = mismatch;

    let mut diagnostic = Diagnostic::new(InterpretDiagnosticCategory::TypeInvariant, Severity::Bug)
        .primary(Label::new(
            span,
            format!(
                "cannot apply `{}` to `{}` and `{}`",
                op.as_str(),
                lhs.type_name(),
                rhs.type_name()
            ),
        ));

    diagnostic.add_message(Message::note(format!(
        "expected `{lhs_expected}` and `{rhs_expected}`"
    )));

    diagnostic.add_message(Message::help(
        "type checking should have ensured operand types match the operator",
    ));

    diagnostic
}

#[coverage(off)]
fn unary_type_mismatch(span: SpanId, mismatch: UnaryTypeMismatch) -> InterpretDiagnostic {
    let UnaryTypeMismatch {
        op,
        expected,
        value,
    } = mismatch;

    let mut diagnostic = Diagnostic::new(InterpretDiagnosticCategory::TypeInvariant, Severity::Bug)
        .primary(Label::new(
            span,
            format!("cannot apply `{}` to `{}`", op.as_str(), value.type_name()),
        ));

    diagnostic.add_message(Message::note(format!("expected `{expected}`")));

    diagnostic.add_message(Message::help(
        "type checking should have ensured operand type matches the operator",
    ));

    diagnostic
}

#[coverage(off)]
fn apply_non_pointer(span: SpanId, r#type: &TypeName) -> InterpretDiagnostic {
    let mut diagnostic =
        Diagnostic::new(InterpretDiagnosticCategory::TypeInvariant, Severity::Bug).primary(
            Label::new(span, format!("cannot call `{type}` as a function")),
        );

    diagnostic.add_message(Message::help(
        "type checking should have ensured only function pointers are called",
    ));

    diagnostic
}

// =============================================================================
// ICE: Structural Invariant
// =============================================================================

#[coverage(off)]
fn struct_field_length_mismatch(span: SpanId, values: usize, fields: usize) -> InterpretDiagnostic {
    let mut diagnostic = Diagnostic::new(
        InterpretDiagnosticCategory::StructuralInvariant,
        Severity::Bug,
    )
    .primary(Label::new(
        span,
        format!("struct aggregate has {values} values but {fields} fields"),
    ));

    diagnostic.add_message(Message::help(
        "MIR construction should ensure aggregate value counts match field counts",
    ));

    diagnostic
}

// =============================================================================
// ICE: Control Flow
// =============================================================================

#[coverage(off)]
fn invalid_discriminant(span: SpanId, value: Int) -> InterpretDiagnostic {
    let mut diagnostic = Diagnostic::new(InterpretDiagnosticCategory::ControlFlow, Severity::Bug)
        .primary(Label::new(
            span,
            format!("switch discriminant `{value}` has no matching branch"),
        ));

    diagnostic.add_message(Message::help(
        "MIR construction should ensure all discriminant values have corresponding branches",
    ));

    diagnostic
}

#[coverage(off)]
fn unreachable_reached(span: SpanId) -> InterpretDiagnostic {
    let mut diagnostic = Diagnostic::new(InterpretDiagnosticCategory::ControlFlow, Severity::Bug)
        .primary(Label::new(span, "reached unreachable code"));

    diagnostic.add_message(Message::help(
        "control flow analysis should have ensured this code is never reached",
    ));

    diagnostic
}

#[coverage(off)]
fn callstack_empty(span: SpanId) -> InterpretDiagnostic {
    let mut diagnostic = Diagnostic::new(InterpretDiagnosticCategory::ControlFlow, Severity::Bug)
        .primary(Label::new(span, "attempted to step with empty callstack"));

    diagnostic.add_message(Message::help(
        "interpreter logic error: callstack should never be empty during execution",
    ));

    diagnostic
}

// =============================================================================
// Error: Bounds Check (ICE in the future)
// =============================================================================

#[coverage(off)]
fn out_of_range(span: SpanId, length: usize, index: Int) -> InterpretDiagnostic {
    let mut diagnostic = Diagnostic::new(InterpretDiagnosticCategory::BoundsCheck, Severity::Error)
        .primary(Label::new(
            span,
            format!("index `{index}` is out of bounds for length {length}"),
        ));

    diagnostic.add_message(Message::note(format!("valid indices are 0..{length}")));

    diagnostic
}

// =============================================================================
// Error: Input Resolution (ICE in the future)
// =============================================================================

#[coverage(off)]
fn input_not_found(span: SpanId, name: Symbol) -> InterpretDiagnostic {
    let mut diagnostic = Diagnostic::new(
        InterpretDiagnosticCategory::InputResolution,
        Severity::Error,
    )
    .primary(Label::new(span, format!("input `{name}` not found")));

    diagnostic.add_message(Message::help("ensure the input is provided to the runtime"));

    diagnostic
}

// =============================================================================
// Error: Runtime Limit
// =============================================================================

#[coverage(off)]
fn recursion_limit_exceeded(span: SpanId, limit: usize) -> InterpretDiagnostic {
    let mut diagnostic =
        Diagnostic::new(InterpretDiagnosticCategory::RuntimeLimit, Severity::Error).primary(
            Label::new(span, format!("recursion limit of {limit} exceeded")),
        );

    diagnostic.add_message(Message::help(
        "consider refactoring to reduce recursion depth or increasing the limit",
    ));

    diagnostic
}
