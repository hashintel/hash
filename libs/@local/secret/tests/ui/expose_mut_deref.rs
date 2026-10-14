use hash_secret::Secret;

fn main() {
    let mut secret = Box::pin(Secret::<[u8; 4]>::zeroed());
    let _copy = *secret.as_mut().expose_mut();
}
