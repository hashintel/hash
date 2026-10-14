use hash_secret::Secret;

fn main() {
    let secret = Box::pin(Secret::<[u8; 4]>::zeroed());
    let _copy = *secret.expose();
}
