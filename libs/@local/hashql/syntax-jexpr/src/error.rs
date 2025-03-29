use hashql_diagnostics::Diagnostic;

pub(crate) trait ResultExt {
    type Ok;
    type DiagnosticCategory;
    type Span;

    fn change_category<C>(
        self,
        category: impl FnOnce(Self::DiagnosticCategory) -> C,
    ) -> Result<Self::Ok, Diagnostic<C, Self::Span>>;
}

impl<T, C, S> ResultExt for Result<T, Diagnostic<C, S>> {
    type DiagnosticCategory = C;
    type Ok = T;
    type Span = S;

    fn change_category<D>(
        self,
        category: impl FnOnce(Self::DiagnosticCategory) -> D,
    ) -> Result<T, Diagnostic<D, Self::Span>> {
        self.map_err(|diagnostic| diagnostic.map_category(category))
    }
}
