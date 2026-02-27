#![expect(clippy::result_large_err)]
use unsynn::{
    BracketGroupContaining, Cons, Either, Except, Gt, Ident, Lt, Many, ParenthesisGroupContaining,
    PathSep, PathSepDelimited, Pound, TokenTree, keyword, unsynn,
};

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
    pub KConst = ["const"];
    pub KU8 = ["u8"];
    pub KU16 = ["u16"];
    pub KU32 = ["u32"];
    pub KU64 = ["u64"];
    pub KU128 = ["u128"];
    pub KUsize = ["usize"];
}

pub(crate) type VerbatimUntil<C> = Many<Cons<Except<C>, AngleTokenTree>>;
pub(crate) type ModPath = Cons<Option<PathSep>, PathSepDelimited<Ident>>;
pub(crate) type Visibility =
    Cons<KPub, Option<ParenthesisGroupContaining<Cons<Option<KIn>, ModPath>>>>;

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
