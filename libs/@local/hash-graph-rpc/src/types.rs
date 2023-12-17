use std::marker::PhantomData;

pub struct Stack<Next, Tail> {
    next: PhantomData<Next>,
    tail: PhantomData<Tail>,
}
