use hash_crypto::Secret;

fn main() {
    let key = Box::pin(Secret::<[u8; 4]>::zeroed());
    let password = Secret::from_string("abcd".to_owned());

    let _ = &*key == "abcd"; //~ E0271
    let _ = &*password == b"abcd".as_slice(); //~ E0271
    let _ = *key == *password; //~ E0271
}
