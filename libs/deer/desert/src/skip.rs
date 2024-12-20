use crate::{Token, deserializer::Deserializer};

fn scan_object(deserializer: &Deserializer, stop: &Token) -> usize {
    let mut objects: usize = 0;
    let mut arrays: usize = 0;

    let mut n = 0;

    loop {
        let Some(token) = deserializer.peek_n(n) else {
            // we're at the end
            return n;
        };

        if token == *stop && arrays == 0 && objects == 0 {
            // we're at the outer layer, meaning we can know where we end
            // need to increment by one as we want to also skip the ObjectEnd
            return n + 1;
        }

        match token {
            Token::Array { .. } => arrays += 1,
            Token::ArrayEnd => arrays = arrays.saturating_sub(1),
            Token::Object { .. } => objects += 1,
            Token::ObjectEnd => objects = objects.saturating_sub(1),
            _ => {}
        }

        n += 1;
    }
}

/// Skips all tokens required for the start token, be aware that the start token should no longer be
/// on the tape
pub(crate) fn skip_tokens(deserializer: &mut Deserializer, start: &Token) {
    let n = match start {
        Token::Array { .. } => scan_object(&*deserializer, &Token::ArrayEnd),
        Token::Object { .. } => scan_object(&*deserializer, &Token::ObjectEnd),
        _ => 0,
    };

    if n > 0 {
        deserializer.tape_mut().bump_n(n);
    }
}
