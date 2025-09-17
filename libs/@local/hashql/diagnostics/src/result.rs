use core::{
    convert::Infallible,
    ops::{ControlFlow, FromResidual, Try},
};

use crate::{Diagnostic, DiagnosticIssues, category::DiagnosticCategory};

#[derive(Debug)]
pub struct DiagnosticValue<T, C, S> {
    pub value: T,
    pub diagnostics: DiagnosticIssues<C, S>,
}

#[derive(Debug)]
pub struct DiagnosticError<C, S> {
    pub primary: Diagnostic<C, S>,
    pub secondary: DiagnosticIssues<C, S>,
}

impl<C, S> DiagnosticError<C, S> {
    pub fn into_issues(mut self) -> DiagnosticIssues<C, S> {
        self.secondary.insert_front(self.primary);
        self.secondary
    }
}

#[must_use]
#[derive(Debug)]
pub struct DiagnosticResult<T, C, S> {
    diagnostics: DiagnosticIssues<C, S>,
    result: Result<T, Diagnostic<C, S>>,
}

impl<T, C, S> DiagnosticResult<T, C, S> {
    pub const fn ok(value: T) -> Self {
        Self {
            diagnostics: DiagnosticIssues::new(),
            result: Ok(value),
        }
    }

    pub const fn err(diagnostic: Diagnostic<C, S>) -> Self {
        assert!(
            diagnostic.severity.is_fatal(),
            "Diagnostic severity must be fatal"
        );

        Self {
            diagnostics: DiagnosticIssues::new(),
            result: Err(diagnostic),
        }
    }

    pub const fn try_err(diagnostic: Diagnostic<C, S>) -> Result<Self, Diagnostic<C, S>> {
        if !diagnostic.severity.is_fatal() {
            return Err(diagnostic);
        }

        Ok(Self {
            diagnostics: DiagnosticIssues::new(),
            result: Err(diagnostic),
        })
    }

    pub fn boxed<'category>(self) -> DiagnosticResult<T, Box<dyn DiagnosticCategory + 'category>, S>
    where
        C: DiagnosticCategory + 'category,
    {
        let Self {
            diagnostics,
            result,
        } = self;

        let diagnostics = diagnostics.boxed();
        let result = result.map_err(Diagnostic::boxed);

        DiagnosticResult {
            diagnostics,
            result,
        }
    }

    pub fn map_ok<U>(self, func: impl FnOnce(T) -> U) -> DiagnosticResult<U, C, S> {
        let Self {
            diagnostics,
            result,
        } = self;

        let result = result.map(func);

        DiagnosticResult {
            diagnostics,
            result,
        }
    }

    pub fn map_diagnostics<C2, S2>(
        self,
        mut func: impl FnMut(Diagnostic<C, S>) -> Diagnostic<C2, S2>,
    ) -> DiagnosticResult<T, C2, S2> {
        let Self {
            diagnostics,
            result,
        } = self;

        let diagnostics = diagnostics.map(&mut func);
        let result = result.map_err(func);

        DiagnosticResult {
            diagnostics,
            result,
        }
    }

    pub fn push_diagnostic(&mut self, diagnostic: Diagnostic<C, S>) {
        if self.result.is_ok() && diagnostic.severity.is_fatal() {
            self.result = Err(diagnostic);
        } else {
            self.diagnostics.push(diagnostic);
        }
    }

    pub fn append_diagnostics(&mut self, diagnostics: &mut DiagnosticIssues<C, S>) {
        self.diagnostics.append(diagnostics);

        if self.result.is_ok()
            && let Some(fatal) = self.diagnostics.pop_fatal()
        {
            self.result = Err(fatal);
        }
    }

    pub fn into_result(self) -> Result<DiagnosticValue<T, C, S>, Box<DiagnosticError<C, S>>> {
        match self.result {
            Ok(value) => {
                debug_assert_eq!(
                    self.diagnostics.fatal(),
                    0,
                    "Fatal diagnostics should have been promoted to an error variant"
                );

                Ok(DiagnosticValue {
                    value,
                    diagnostics: self.diagnostics,
                })
            }
            Err(diagnostic) => {
                debug_assert!(
                    diagnostic.severity.is_fatal(),
                    "Fatal diagnostics should only be present in error variants"
                );

                Err(Box::new(DiagnosticError {
                    primary: diagnostic,
                    secondary: self.diagnostics,
                }))
            }
        }
    }
}

impl<T, C, S> From<DiagnosticValue<T, C, S>> for DiagnosticResult<T, C, S> {
    fn from(DiagnosticValue { value, diagnostics }: DiagnosticValue<T, C, S>) -> Self {
        Self {
            result: Ok(value),
            diagnostics,
        }
    }
}

impl<T, C, S> From<DiagnosticError<C, S>> for DiagnosticResult<T, C, S> {
    fn from(DiagnosticError { primary, secondary }: DiagnosticError<C, S>) -> Self {
        Self {
            result: Err(primary),
            diagnostics: secondary,
        }
    }
}

impl<T, C, S> FromResidual<Result<Infallible, DiagnosticIssues<C, S>>>
    for DiagnosticResult<T, C, S>
{
    fn from_residual(Err(mut diagnostics): Result<Infallible, DiagnosticIssues<C, S>>) -> Self {
        let error = diagnostics
            .pop_fatal()
            .expect("error variant should have at least one fatal error");

        Self {
            result: Err(error),
            diagnostics,
        }
    }
}

impl<T, C, S> FromResidual<Result<Infallible, Diagnostic<C, S>>> for DiagnosticResult<T, C, S> {
    fn from_residual(Err(diagnostic): Result<Infallible, Diagnostic<C, S>>) -> Self {
        assert!(
            diagnostic.severity.is_fatal(),
            "Error diagnostic must always be fatal"
        );

        Self {
            result: Err(diagnostic),
            diagnostics: DiagnosticIssues::new(),
        }
    }
}

impl<T, C, S> FromResidual<DiagnosticResult<!, C, S>> for DiagnosticResult<T, C, S> {
    fn from_residual(residual: DiagnosticResult<!, C, S>) -> Self {
        let Err(error) = residual.result;

        Self {
            result: Err(error),
            diagnostics: residual.diagnostics,
        }
    }
}

impl<T, C, S> Try for DiagnosticResult<T, C, S> {
    type Output = DiagnosticValue<T, C, S>;
    type Residual = DiagnosticResult<!, C, S>;

    fn from_output(output: Self::Output) -> Self {
        let DiagnosticValue { value, diagnostics } = output;

        Self {
            result: Ok(value),
            diagnostics,
        }
    }

    fn branch(self) -> ControlFlow<Self::Residual, Self::Output> {
        match self.result {
            Ok(value) => {
                debug_assert_eq!(
                    self.diagnostics.fatal(),
                    0,
                    "Fatal diagnostics should have been promoted to an error variant"
                );

                ControlFlow::Continue(DiagnosticValue {
                    value,
                    diagnostics: self.diagnostics,
                })
            }
            Err(diagnostic) => {
                debug_assert!(
                    diagnostic.severity.is_fatal(),
                    "Fatal diagnostics should only be present in error variants"
                );

                ControlFlow::Break(DiagnosticResult {
                    result: Err(diagnostic),
                    diagnostics: self.diagnostics,
                })
            }
        }
    }
}
