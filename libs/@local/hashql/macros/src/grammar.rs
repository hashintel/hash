use unsynn::*;

keyword! {
    /// The "pub" keyword.
    pub KPub = ["pub"];
    /// The "struct" keyword.
    pub KStruct = ["struct"];
    /// The "enum" keyword.
    pub KEnum = ["enum"];
    /// The "in" keyword.
    pub KIn = ["in"];
    pub KId = ["id"];
    pub KDerive = ["derive"];
    pub KDisplay = ["display"];
    pub KStep = ["Step"];
    pub KIs = ["is"];
    pub KCrate = ["crate"];
}

pub type VerbatimUntil<C> = Many<Cons<Except<C>, AngleTokenTree>>;
pub type ModPath = Cons<Option<PathSep>, PathSepDelimited<Ident>>;
pub type Visibility = Cons<KPub, Option<ParenthesisGroupContaining<Cons<Option<KIn>, ModPath>>>>;

pub struct Bridge<T>(pub T);
impl<T> ToTokens for Bridge<T>
where
    T: proc_macro::ToTokens,
{
    fn to_tokens(&self, tokens: &mut TokenStream) {
        proc_macro::ToTokens::to_tokens(&self.0, tokens);
    }
}

unsynn! {
    /// Parses either a `TokenTree` or `<...>` grouping (which is not a [`Group`] as far as proc-macros
    /// are concerned).
    #[derive(Clone)]
    pub struct AngleTokenTree(
        pub Either<Cons<Lt, Vec<Cons<Except<Gt>, AngleTokenTree>>, Gt>, TokenTree>,
    );

    /// Represents an attribute annotation on a field, typically in the form `#[attr]`.
    pub struct Attribute<B> {
        /// The pound sign preceding the attribute.
        pub _pound: Pound,
        /// The content of the attribute enclosed in square brackets.
        pub body: BracketGroupContaining<B>,
    }
}
