#![expect(non_upper_case_globals, non_snake_case, clippy::min_ident_chars)]
use super::Symbol;

hashql_macros::define_symbols! {
    // [tidy] sort alphabetically start
    access,
    add,
    and,
    archived,
    archived_by_id,
    bar,
    BaseUrl,
    bit_and,
    bit_not,
    bit_or,
    bit_shl,
    bit_shr,
    bit_xor,
    Boolean,
    collect,
    confidence,
    core,
    created_at_decision_time,
    created_at_transaction_time,
    created_by_id,
    decision_time,
    Dict,
    div,
    draft_id,
    dummy: "<!dummy!>",
    E,
    edition,
    edition_id,
    encodings,
    entity,
    entity_edition_id,
    entity_id,
    entity_type_ids,
    entity_uuid,
    eq,
    Err,
    filter,
    foo,
    gt,
    gte,
    id,
    index,
    inferred,
    input,
    input_exists: "$exists",
    Integer,
    Intersection,
    kernel,
    left_entity_confidence,
    left_entity_id,
    left_entity_provenance,
    link_data,
    List,
    lt,
    lte,
    math,
    metadata,
    mul,
    ne,
    Never,
    None,
    not,
    Null,
    null,
    Number,
    Ok,
    option,
    or,
    pow,
    properties,
    provenance,
    provided,
    r#as: "as",
    r#as_force: "as!",
    r#else: "else",
    r#false: "false",
    r#fn: "fn",
    r#if: "if",
    r#in: "in",
    r#is: "is",
    r#let: "let",
    r#mod: "mod",
    r#newtype: "newtype",
    r#true: "true",
    r#type: "type",
    r#use: "use",
    R,
    record_id,
    Result,
    right_entity_confidence,
    right_entity_id,
    right_entity_provenance,
    Some,
    special_form,
    String,
    sub,
    T,
    temporal_versioning,
    then: "then",
    thunk: "thunk",
    transaction_time,
    U,
    Union,
    Unknown,
    unknown,
    Url,
    vectors,
    web_id,
    // [tidy] sort alphabetically end

    internal: {
        ClosureEnv: "'<ClosureEnv>"
    },

    symbol: {
        // [tidy] sort alphabetically start
        ampamp: "&&",
        ampersand: "&",
        arrow: "->",
        arrow_head: "|>",
        asterisk: "*",
        exclamation: "!",
        excleq: "!=",
        brackets: "[]",
        caret: "^",
        colon: ":",
        coloncolon: "::",
        comma: ",",
        dollar: "$",
        dollar_question_mark: "$?",
        dot: ".",
        eq: "=",
        eqeq: "==",
        gt: ">",
        gteq: ">=",
        gtgt: ">>",
        lt: "<",
        lteq: "<=",
        ltlt: "<<",
        minus: "-",
        pipepipe: "||",
        pipe: "|",
        plus: "+",
        question_mark: "?",
        slash: "/",
        tilde: "~",
        // [tidy] sort alphabetically end
    },

    digit: {
        zero: "0",
        one: "1",
        two: "2",
        three: "3",
        four: "4",
        five: "5",
        six: "6",
        seven: "7",
        eight: "8",
        nine: "9",
    },

    path: {
        // [tidy] sort alphabetically start
        Entity: "::graph::types::knowledge::entity::Entity",
        graph_body_filter: "::graph::body::filter",
        graph_head_entities: "::graph::head::entities",
        graph_tail_collect: "::graph::tail::collect",
        none: "::core::option::None",
        option: "::core::option::Option",
        some: "::core::option::Some",
        // [tidy] sort alphabetically end
    }
}

#[cfg(test)]
mod tests {
    use std::collections::HashSet;

    use super::SYMBOLS;

    #[test]
    fn symbols_are_unique() {
        let mut set = HashSet::with_capacity(SYMBOLS.len());

        for symbol in SYMBOLS {
            set.insert(*symbol);
        }

        assert_eq!(set.len(), SYMBOLS.len(), "duplicate symbol value found");
    }
}
