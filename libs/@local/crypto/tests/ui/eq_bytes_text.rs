use hash_crypto::Secret;

fn main() {
    let key = Box::pin(Secret::<[u8; 4]>::zeroed());
    let password = Secret::from_string("abcd".to_owned());

    let _ = &*key == "abcd";
    let _ = &*password == b"abcd".as_slice();
    let _ = *key == *password;
}
