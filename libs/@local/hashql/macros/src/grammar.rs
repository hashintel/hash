#![expect(clippy::result_large_err)]
use unsynn::{
    BracketGroupContaining, Cons, Either, Except, Gt, Ident, Lt, Many, ParenthesisGroupContaining,
    PathSep, PathSepDelimited, Pound, TokenTree, keyword, unsynn,
};

keyword! {
    pub KPub = "pub";
    pub KStruct = "struct";
    pub KEnum = "enum";
    pub KIn = "in";
    pub KId = "id";
    pub KDerive = "derive";
    pub KDisplay = "display";
    pub KStep = "Step";
    pub KIs = "is";
    pub KCrate = "crate";
    pub KConst = "const";
    pub KU8 = "u8";
    pub KU16 = "u16";
    pub KU32 = "u32";
    pub KU64 = "u64";
    pub KU128 = "u128";
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

    /// An attribute in the form `#[...]`.
    pub struct Attribute<B> {
        pub _pound: Pound,
        pub body: BracketGroupContaining<B>,
    }
}
