/// Macro for creating binary and unary operators.
///
/// This macro provides a convenient way to create operator values for use with
/// [`RValueBuilder::binary`] and [`RValueBuilder::unary`].
///
/// # Binary Operators
///
/// Comparison and logical operators are supported:
///
/// ```
/// use hashql_mir::body::rvalue::BinOp;
/// use hashql_mir::op;
///
/// // Bitwise
/// assert!(matches!(op![&], BinOp::BitAnd));
/// assert!(matches!(op![|], BinOp::BitOr));
///
/// // Comparison
/// assert!(matches!(op![==], BinOp::Eq));
/// assert!(matches!(op![!=], BinOp::Ne));
/// assert!(matches!(op![<], BinOp::Lt));
/// assert!(matches!(op![<=], BinOp::Lte));
/// assert!(matches!(op![>], BinOp::Gt));
/// assert!(matches!(op![>=], BinOp::Gte));
/// ```
///
/// Arithmetic operators are also available (`op![+]`, `op![-]`, `op![*]`, `op![/]`),
/// though they use uninhabited marker types in the current type system.
///
/// # Unary Operators
///
/// ```
/// use hashql_hir::node::operation::UnOp;
/// use hashql_mir::op;
///
/// assert!(matches!(op![!], UnOp::Not));
/// assert!(matches!(op![neg], UnOp::Neg)); // `neg` is used since `-` alone is ambiguous
/// ```
#[macro_export]
macro_rules! op {
    // Binary operators
    [+] => { $crate::body::rvalue::BinOp::Add };
    [-] => { $crate::body::rvalue::BinOp::Sub };
    [*] => { $crate::body::rvalue::BinOp::Mul };
    [/] => { $crate::body::rvalue::BinOp::Div };
    [==] => { $crate::body::rvalue::BinOp::Eq };
    [!=] => { $crate::body::rvalue::BinOp::Ne };
    [<] => { $crate::body::rvalue::BinOp::Lt };
    [<=] => { $crate::body::rvalue::BinOp::Lte };
    [>] => { $crate::body::rvalue::BinOp::Gt };
    [>=] => { $crate::body::rvalue::BinOp::Gte };
    [&] => { $crate::body::rvalue::BinOp::BitAnd };
    [|] => { $crate::body::rvalue::BinOp::BitOr };

    // Unary operators
    [!] => { hashql_hir::node::operation::UnOp::Not };
    [neg] => { hashql_hir::node::operation::UnOp::Neg };
}

#[macro_export]
macro_rules! operand {
    ($b:expr; $value:expr) => {{
        let o = $b.operands();

        $crate::builder::operand!(@impl o; $value)
    }};

    (@impl $o:expr; fn() @ $def:ident) => {
        $o.const_fn($def)
    };
    (@impl $o:expr; $value:expr) => {
        $crate::builder::BuildOperand::build_operand(&$o, $value)
    };

}

#[macro_export]
macro_rules! bb {
    ($b:expr; { $($rest:tt)* }) => {
        $crate::builder::bb!(@impl $b; $($rest)*)
    };
    (@impl $b:expr;) => {};
    (@impl $b:expr; let $name:expr; $($rest:tt)*) => {
        $b = $b.storage_live($name);
        $crate::builder::bb!(@impl $b; $($rest)*)
    };
    (@impl $b:expr; drop $name:expr; $($rest:tt)*) => {
        $b = $b.storage_dead($name);
        $crate::builder::bb!(@impl $b; $($rest)*)
    };
    (@impl $b:expr; $name:ident = load $lhs:tt; $($rest:tt)*) => {
        $b = $b.assign_place($name, |rv| {
            let func = $crate::builder::operand!(*rv; $lhs);

            rv.load(func)
        });
        $crate::builder::bb!(@impl $b; $($rest)*)
    };
    (@impl $b:expr; $name:ident = apply $lhs:tt; $($rest:tt)*) => {
        $b = $b.assign_place($name, |rv| {
            let func = $crate::builder::operand!(*rv; $lhs);
            rv.call(func)
        });
        $crate::builder::bb!(@impl $b; $($rest)*)
    };
    (@impl $b:expr; $name:ident = apply $lhs:tt $($arg:tt)+; $($rest:tt)*) => {
        $b = $b.assign_place($name, |rv| {
            let func = $crate::builder::operand!(*rv; $lhs);
            let args = [$($crate::builder::operand!(*rv; $arg),)*];

            rv.apply(func, args)
        });
        $crate::builder::bb!(@impl $b; $($rest)*)
    };
    (@impl $b:expr; $name:ident = tuple $($field:tt)*; $($rest:tt)*) => {
        $b = $b.assign_place($name, |rv| {
            let fields = [$($crate::builder::operand!(rv; $field),)*];
            rv.tuple(fields)
        });
        $crate::builder::bb!(@impl $b; $($rest)*)
    };
    (@impl $b:expr; $name:ident = bin.$op:tt $lhs:tt $rhs:tt; $($rest:tt)*) => {
        $b = $b.assign_place($name, |rv| {
            let lhs = $crate::builder::operand!(rv; $lhs);
            let rhs = $crate::builder::operand!(rv; $rhs);

            rv.binary(lhs, $crate::builder::op![$op], rhs)
        });
        $crate::builder::bb!(@impl $b; $($rest)*)
    };
    (@impl $b:expr; $name:ident = un.$op:tt $arg:tt; $($rest:tt)*) => {
        $b = $b.assign_place($name, |rv| {
            let arg = $crate::builder::operand!(rv; $arg);
            rv.unary($crate::builder::op![$op], arg)
        });
        $crate::builder::bb!(@impl $b; $($rest)*)
    };

    (@impl $b:expr; return $value:tt; $($rest:tt)*) => {
        let returns = $crate::builder::operand!(*$b; $value);
        $b.ret(returns);
        $crate::builder::bb!(@impl $b; $($rest)*)
    };
    (@impl $b:expr; goto $target:ident($($arg:tt),*); $($rest:tt)*) => {
        let args = [$($crate::builder::operand!(*$b; $arg)),*];
        $b.goto($target, args);

        $crate::builder::bb!(@impl $b; $($rest)*)
    };
    (@impl $b:expr; if $cond:tt $then:ident($($thenarg:tt),*) $else:ident($($elsearg:tt),*); $($rest:tt)*) => {
        let cond = $crate::builder::operand!(*$b; $cond);
        let thenargs = [$($crate::builder::operand!(*$b; $thenarg)),*];
        let elseargs = [$($crate::builder::operand!(*$b; $elsearg)),*];
        $b.if_else(cond, $then, thenargs, $else, elseargs);

        $crate::builder::bb!(@impl $b; $($rest)*)
    };
}

#[macro_export]
macro_rules! body {
    (
        $interner:ident, $env:ident;
        $type:ident @ $id:literal / $arity:literal -> $body_type:tt {
            decl $($param:ident: $param_type:tt),*;

            $($block:ident($($block_param:ident),*) $block_body:tt),+
        }
    ) => {{
        let mut builder = $crate::builder::BodyBuilder::new(&$interner);
        let types =  hashql_core::r#type::TypeBuilder::synthetic(&$env);

        // Create all the params required
        $(
            let $param = builder.local(stringify!($param), $crate::builder::body!(@type types; $param_type));
        )*

        // Create all the blocks required
        $(
            let $block = builder.reserve_block([$($block_param.local),*]);
        )*

        // Now we need to build each block
        $(
            let mut bb_builder = builder.build_block($block);

            $crate::builder::bb!(bb_builder; $block_body);
        )*

        // We now need to finish everything
        let mut body = builder.finish($arity, $crate::builder::body!(@type types; $body_type));
        body.source = $crate::builder::body!(@source $type);
        body.id = $crate::def::DefId::new($id);

        body
    }};

    (@type $types:ident; Int) => {
        $types.integer()
    };
    (@type $types:ident; ($($sub:tt),*)) => {
        $types.tuple([$($crate::builder::body!(@type $types; $sub)),*])
    };
    (@type $types:ident; Bool) => {
        $types.boolean()
    };
    (@type $types:ident; $other:expr) => {
        $other($types)
    };

    (@source thunk) => {
        $crate::body::Source::Thunk(hashql_hir::node::HirId::PLACEHOLDER, None)
    };
    (@source fn) => {
        $crate::body::Source::Closure(hashql_hir::node::HirId::PLACEHOLDER, None)
    };
}

pub use bb;
pub use body;
pub use op;
pub use operand;
