use justjson::parser::{Token, Tokenizer};

fn skip_nested(tokenizer: &mut Tokenizer<false>, stop: &Token) {
    let mut objects: usize = 0;
    let mut arrays: usize = 0;

    loop {
        let Some(token) = tokenizer.next() else {
            // we're at the end
            return;
        };

        // `.next()` will only error out if a string or number is malformed
        // we can safely skip those as they do not modify nested status
        let Ok(token) = token else {
            continue;
        };

        if token == *stop && arrays == 0 && objects == 0 {
            // we're at the outer layer, we have already consumed the token and can safely return
            return;
        }

        // using `saturating_sub` here makes us more resilient to potential syntax errors, let's
        // say we have: `{"a": []]}` <- we try to parse `u8` instead of `[]`, and while finishing
        // the object we can skip the `]` (but we will still error out at `.end()`)
        match token {
            Token::Array => arrays += 1,
            Token::ArrayEnd => arrays = arrays.saturating_sub(1),
            Token::Object => objects += 1,
            Token::ObjectEnd => objects = objects.saturating_sub(1),
            _ => {}
        }
    }
}

/// Skips all tokens required for the start token, be aware that the token should already be
/// consumed.
pub(crate) fn skip_tokens(tokenizer: &mut Tokenizer<false>, start: &Token) {
    match start {
        Token::Array => skip_nested(tokenizer, &Token::ArrayEnd),
        Token::Object => skip_nested(tokenizer, &Token::ObjectEnd),
        _ => {}
    }
}
