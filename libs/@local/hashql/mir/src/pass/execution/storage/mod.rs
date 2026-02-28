mod access;
mod entity;

#[cfg(test)]
mod tests;

pub use entity::EntityPath;

pub(crate) use self::access::Access;
