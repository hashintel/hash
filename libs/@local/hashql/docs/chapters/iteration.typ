#set text(lang: "en", region: "GB")
#import "../template/lib.typ": incomplete, note, proof, rule

#let reject(body) = html.details(class: "note reject")[
  #html.elem("summary")[Rejected idea]
  #html.div(class: "reject-body", body)
]

== Iteration <iteration>

#incomplete("chapter")

HashQL requires two distinct forms of iteration. Inter-vertex iteration is provided by the graph effect and its body transformations. Intra-vertex iteration occurs within a body transformation and supports computations performed on an individual vertex. Its uses include aggregating property values, filtering or transforming an entity's properties, and traversing the property declarations of an entity type.

The computations required within a body transformation are open-ended because transformations are ordinary closures. We therefore introduce a general-purpose iteration construct through which programs can express computations, rather than defining each computation as a specialised graph operation.

#reject[
  An initial prototype represented iteration through a catalogue of specialised functions that depended on one another. Although feasible, this approach made backend eligibility and cost analysis interprocedural. The solver had to determine whether callees could execute on a target backend and, where no native implementation was available, inspect their fallback bodies and estimate call costs. Higher-order primitives such as ```hashql any``` and ```hashql all``` also required the compiler to establish that their callbacks could execute on the target backend. Under this design, backends without general callable support required a known callback implementation, with unresolved callable targets using the generalised fallback backend. Consequently, the generalised fallback backend was selected in most cases, except when a closure was supplied directly as an argument.

  Users could define iteration functions by composing compiler-known primitives, and those primitives could still be specialised individually. However, the compiler could not automatically recognise the composed function as a single backend operation. The placement opportunities exposed by a composition depended on its primitive boundaries and fallback bodies. Authors consequently had to reason about these implementation details when composing iteration functions.
]

Iteration must converge because query code executes on the server, which may impose additional computational bounds. Inter-vertex enumeration is bounded by the finite set of vertices, but evaluation also requires each body transformation to converge. Intra-vertex iteration must satisfy the same requirement. When the compiler cannot establish convergence mechanically, an explicit annotation must discharge the remaining proof obligation.

#note[All examples in this section are illustrative.]

=== Recursion

The ```hashql 'let``` special form introduces recursive value bindings. It is a variant of ```hashql let``` in which every bound name is available within every initialising expression in the same binding group. The initialising expressions need not be closures, but their evaluation must satisfy the convergence requirement. Internally, each binding is converted into a thunk that is invoked when the binding is referenced.

#note[
  Recursive bindings are currently conceptual and are not planned to be made available to user programs.
]

```hashql
'let 'parity = (
  even: (n: Integer): Boolean ->
    if n == 0
    then true
    else 'parity.odd(if n > 0 then n - 1 else n + 1),

  odd: (n: Integer): Boolean ->
    if n == 0
    then false
    else 'parity.even(if n > 0 then n - 1 else n + 1)
) in
'parity.even(10)
```

#note[
  Recursive bindings conventionally have a leading apostrophe. A binding's name does not determine whether it is recursive; only the invoked special form does. A future lint rule may enforce this naming convention.
]

As outlined in @iteration, recursive functions must guarantee convergence. When convergence cannot be mechanically proved, the author of the definition must discharge the remaining proof obligation or transfer it to the caller. HashQL provides two attribute-based mechanisms for doing so:

- An ```hashql #[unsafe(converges = "reason")]``` attribute on a binding asserts that the binding converges, records the supporting justification, and places responsibility for the assertion on the author.
- A ```hashql #[requires_convergence]``` attribute on a closure parameter transfers the associated convergence obligation to the caller. When the compiler cannot discharge this obligation for the supplied arguments, the caller must provide a justification by applying ```hashql #[unsafe(converges = "reason")]``` to the corresponding argument.

For some functions, the compiler can prove convergence automatically. For example, it can prove that the following Fibonacci function terminates for every integer input:

```hashql
'let 'fibonacci = (n: Integer): Integer ->
  if n < 2
  then n
  else 'fibonacci(n - 1) + 'fibonacci(n - 2)
```

#proof[Convergence of ```hashql 'fibonacci```][
  Define the following ranking function:

  $ rho: bb(Z) -> bb(N)_0, quad rho(n) = max(n, 0). $

  The rank is a non-negative integer for every input, including negative inputs. We prove convergence by well-founded induction on $rho(n)$. If $n < 2$, evaluation returns without recursion. Otherwise, $n >= 2$ and $rho(n) = n$. Consequently, $rho(n - 1) < rho(n)$ and $rho(n - 2) < rho(n)$, so the induction hypothesis applies. Both recursive calls therefore converge, and the enclosing call returns their sum.
]

When the compiler cannot prove that a function converges, the author must annotate the function with ```hashql #[unsafe(converges = "reason")]``` and state why convergence is guaranteed.

```hashql
#[unsafe(converges = "recursive calls decrease max(n, 0); n < 2 returns without recursion")]
'let 'fibonacci = (n: Integer): Integer ->
  if n < 2
  then n
  else 'fibonacci(n - 1) + 'fibonacci(n - 2)
```

This mechanism is sufficient for most recursive functions. For some functions, however, convergence may depend on their arguments, as is the case with iteration.

To represent unbounded iteration whose convergence depends on its initial state and step function, HashQL defines the ```hashql 'loop``` function. It takes an initial value of type ```hashql S``` and repeatedly invokes a step function. On each invocation, the step function either produces a new state of type ```hashql S``` or terminates the loop with a result of type ```hashql R```.

```hashql
newtype Continue<T> = T in
newtype Break<T> = T in

type ControlFlow<S, R> = Continue<S> | Break<R> in

'let 'loop = <S, R>(
  init: S,
  #[requires_convergence]
  step: (S) -> ControlFlow<S, R>
): R ->
  match step(init)
    Continue(state) -> 'loop(state, step)
    Break(result) -> result
in ...
```

#proof[Conditional convergence of ```hashql 'loop```][
  Fix ```hashql init``` and ```hashql step```. Let $A subset.eq S$ be the set of states reachable from ```hashql init``` through zero or more ```hashql Continue``` results. Write $s -> s'$ when an invocation of ```hashql step(s)``` returns ```hashql Continue``` with the next state $s'$.

  Suppose that every invocation of ```hashql step``` on a state in $A$ converges. Suppose also that there exists a ranking function $rho: A -> bb(N)_0$ satisfying:

  $ forall s, s' in A: (s -> s') => rho(s') < rho(s). $

  We prove by well-founded induction on $rho(s)$ that ```hashql 'loop(s, step)``` converges for every $s in A$. The first premise ensures that ```hashql step(s)``` terminates. If it returns ```hashql Break```, the loop terminates. If it returns ```hashql Continue```, it produces a reachable state $s'$ of strictly lower rank, so the recursive call converges by the induction hypothesis. These cases exhaust all possible results of ```hashql step```. Hence, ```hashql 'loop``` converges from every state in $A$, including ```hashql init```.
]

The ```hashql #[requires_convergence]``` annotation on ```hashql step``` transfers the convergence obligation for ```hashql 'loop(init, step)``` to the caller. The caller must establish both that every invocation of ```hashql step``` on a reachable state converges and that the iteration reaches ```hashql Break``` after finitely many steps.

#note[
  Proofs of convergence are not restricted to a single technique.
]

=== Bounded Iteration

```hashql 'loop``` requires a convergence proof for arbitrary iteration, which, as shown previously, may require substantial effort. To avoid this burden, we introduce a set of safe primitives that guarantee convergence by imposing a bound.

```hashql
let loop = <S, R>(
  bound: Integer,
  init: S,
  step: (Integer, S) -> ControlFlow<S, R>,
): ControlFlow<S, R> ->
  'loop(
    (0, init),
    #[unsafe(converges = "finite counter progression guarantees convergence")]
    ((index, state)) ->
      if index >= bound
      then Break(Continue(state))
      else match step(index, state)
        Continue(state) -> Continue((index + 1, state))
        Break(value) -> Break(Break(value))
  )
in ...
```

#proof[Conditional convergence of ```hashql loop```][
  Fix ```hashql bound``` at $b in bb(Z)$ and fix the initial state. The recursive state is a pair $(i, s)$, where $i$ is the counter and $s$ is the state supplied to ```hashql step```. Assume that every invocation of ```hashql step``` on a reachable pair with $i < b$ converges. Define the ranking function on reachable pairs by:

  $ rho(i, s) = max(b - i, 0). $

  This rank is a non-negative integer for every reachable pair. If $i >= b$, the closure returns ```hashql Break``` without invoking ```hashql step```. Otherwise, the assumption ensures that ```hashql step(i, s)``` returns. A ```hashql Break``` result terminates the recursion. A ```hashql Continue``` result with state $s'$ advances the counter to $i + 1$. Because $i < b$ and both values are integers, $i + 1 <= b$. Therefore:

  $ rho(i + 1, s') = b - i - 1 < b - i = rho(i, s). $

  The closure therefore converges on every reachable pair, and each ```hashql Continue``` result strictly decreases the rank. These properties satisfy the premises of the conditional convergence proof for ```hashql 'loop```, so ```hashql loop``` converges. The counter starts at zero and advances after each invocation of the callback that returns ```hashql Continue```; consequently, the bound permits at most $max(b, 0)$ invocations of ```hashql step```.
]

Every function invocation, including each invocation of ```hashql step```, must converge. Calls to recursive definitions must discharge their convergence obligations before evaluation. Therefore, ```hashql loop``` is a safe alternative to ```hashql 'loop```. The function returns ```hashql Break(result)``` when ```hashql step``` returns ```hashql Break``` and ```hashql Continue(state)``` when the bound is exhausted without such a result. Both outcomes terminate the loop.

#note[
  A future implementation may require ```hashql bound``` to be evaluable as a constant to support compile-time resource analysis. Constant evaluation is outside the scope of this specification.
]

```hashql loop``` covers the most general form of iteration. However, users are generally expected to iterate over dynamic collections. We therefore introduce two additional safe primitives: ```hashql ::core::list::fold_map``` and ```hashql ::core::dict::fold_map```.

=== List Traversal

List traversal builds on ```hashql ::core::list::fold_map```, which combines an accumulator update with an element transformation. It can therefore express both reduction and transformation operations on lists.

```hashql
let core::list::fold_map = <T, U, V>(
  list: List<T>,
  init: U,
  step: (U, T) -> ControlFlow<(U, V), U>,
): (U, List<V>) ->
  'loop(
    (remaining: list, acc: init, out: []),
    #[unsafe(converges = "each continuation removes one element from the finite remainder")]
    ((remaining:, acc:, out:)) ->
      match remaining
        [] -> Break((acc, out))
        [item, rest @ ..] -> match step(acc, item)
          Continue((next, value)) ->
            Continue((remaining: rest, acc: next, out: out ++ [value]))
          Break(next) -> Break((next, out))
  )
in ...
```

#proof[Convergence of list traversal][
  Write $abs(L)$ for the number of elements in the remaining list $L$. For a traversal state with remaining list $L$, accumulator $a$, and output list $O$, define:

  $ rho(L, a, O) = abs(L). $

  Every reachable remainder is finite, so the rank is a non-negative integer. If the remainder is empty, the closure returns ```hashql Break```. Otherwise, the first element is removed, and ```hashql step``` converges by the language-wide invocation requirement. If ```hashql step``` returns ```hashql Break```, the recursion terminates. If it returns ```hashql Continue```, the next remainder $L'$ has one fewer element:

  $ rho(L', a', O') = abs(L) - 1 < abs(L) = rho(L, a, O). $

  The remaining operations manipulate finite collections and converge. Each invocation of the closure therefore converges, and every continuation decreases the rank. The conditional convergence theorem for ```hashql 'loop``` applies. Thus, ```hashql fold_map``` converges and invokes ```hashql step``` at most once for each input element, in list order.
]

```hashql ::core::list::fold``` and ```hashql ::core::list::map``` derive from ```hashql ::core::list::fold_map``` by retaining the accumulator and output list, respectively. The former supports early termination through ```hashql Break```, whereas the latter transforms each input element.

```hashql
let core::list::fold = <T, U>(
  list: List<T>,
  init: U,
  step: (U, T) -> ControlFlow<U, U>,
): U ->
  core::list::fold_map(list, init, (acc, item) ->
    match step(acc, item)
      Continue(next) -> Continue((next, ()))
      Break(next) -> Break(next)
  ).0
in ...

let core::list::map = <T, U>(
  list: List<T>,
  func: (T) -> U,
): List<U> ->
  core::list::fold_map(list, (), (_, item) -> Continue(((), func(item)))).1
in ...
```

The standard-library examples in @iteration:standard-library:list show how further list operations can be expressed using the iteration primitives.

=== Dictionary Traversal

Dictionary traversal reuses the list primitives defined above, together with two conversion functions: ```hashql ::core::dict::from_entries``` and ```hashql ::core::dict::to_entries```.

```hashql
let core::dict::from_entries = <K, V>(entries: List<(K, V)>): Dict<K, V> ->
  core::list::fold(entries, {}, (dict, (key, value)) -> Continue({key: value, ...dict}))
in ...

#[unsafe(converges = "each recursive call removes one entry from a finite dictionary")]
'let core::dict::to_entries = <K, V>(dict: Dict<K, V>): List<(K, V)> ->
  if dict is {}
  then []
  else
    let {key: value, rest @ ..} = dict in
    [(key, value)] ++ core::dict::to_entries(rest)
in ...
```

```hashql ::core::dict::to_entries``` returns one pair for each dictionary entry, without prescribing their order. ```hashql ::core::dict::from_entries``` consumes its input list in order. A later entry replaces an earlier value under the same key because the explicit entry in ```hashql {key: value, ...dict}``` takes precedence over the spread dictionary. These conversions allow ```hashql ::core::dict::fold_map``` to reuse list traversal while retaining the original keys:

```hashql
let core::dict::fold_map = <K, V, U, W>(
  dict: Dict<K, V>,
  init: U,
  step: (U, K, V) -> ControlFlow<(U, W), U>,
): (U, Dict<K, W>) ->
  let (acc, mapped) = core::list::fold_map(
    core::dict::to_entries(dict),
    init,
    (acc, (key, value)) ->
      match step(acc, key, value)
        Continue((next, mapped)) -> Continue((next, (key, mapped)))
        Break(next) -> Break(next)
  ) in
  (acc, core::dict::from_entries(mapped))
in ...
```

If the callback returns ```hashql Break(next)```, ```hashql fold_map``` returns ```hashql next``` with the entries produced by earlier callback invocations, excluding the current entry. An empty dictionary yields ```hashql (init, {})``` without invoking the callback.

#note[
  The resulting dictionary has no prescribed traversal order. Order-sensitive accumulators and mapped values may depend on the order produced by ```hashql to_entries```, as may the entries retained after an early ```hashql Break```.
]

#proof[Convergence of dictionary traversal][
  Write $abs(D)$ for the number of entries in a finite dictionary $D$. For ```hashql to_entries```, define the ranking function:

  $ rho(D) = abs(D). $

  We prove by well-founded induction on $rho(D)$ that ```hashql to_entries(D)``` converges and returns a list of $abs(D)$ entries. An empty dictionary produces an empty list. Otherwise, the dictionary destructuring pattern selects one entry and leaves a remainder $D'$ satisfying:

  $ rho(D') = abs(D) - 1 < abs(D) = rho(D). $

  The recursive call therefore converges by the induction hypothesis and returns $abs(D) - 1$ entries. Prepending the selected entry produces a finite list of $abs(D)$ entries, which proves the claim.

  The dictionary ```hashql fold_map``` applies the list ```hashql fold_map``` to this finite list of entries. Each invocation of the callback converges by the language-wide invocation requirement, so the list traversal converges and returns a finite list of mapped entries. Reconstructing the dictionary using ```hashql from_entries``` requires another finite list fold whose updates converge. The composition therefore converges, with at most $abs(D)$ invocations of the dictionary callback.
]

In addition to ```hashql ::core::dict::fold_map```, we define ```hashql ::core::dict::fold```, which reduces a dictionary to a single value, and three mapping functions. The callback of each mapping function receives both the key and the value. ```hashql ::core::dict::map_values``` replaces values while retaining keys; ```hashql ::core::dict::map_keys``` replaces keys while retaining values; and ```hashql ::core::dict::map_entries``` replaces both.

```hashql
let core::dict::fold = <K, V, U>(
  dict: Dict<K, V>,
  init: U,
  step: (U, K, V) -> ControlFlow<U, U>,
): U ->
  core::dict::fold_map(dict, init, (acc, key, value) ->
    match step(acc, key, value)
      Continue(next) -> Continue((next, ()))
      Break(next) -> Break(next)
  ).0
in ...

let core::dict::map_values = <K, V, U>(
  dict: Dict<K, V>,
  func: (K, V) -> U,
): Dict<K, U> ->
  core::dict::fold_map(dict, (), (_, key, value) -> Continue(((), func(key, value)))).1
in ...

let core::dict::map_keys = <K, V, J>(
  dict: Dict<K, V>,
  func: (K, V) -> J,
): Dict<J, V> ->
  core::dict::to_entries(dict)
  |> core::list::map(((key, value)) -> (func(key, value), value))
  |> core::dict::from_entries
in ...

let core::dict::map_entries = <K, V, J, U>(
  dict: Dict<K, V>,
  func: (K, V) -> (J, U),
): Dict<J, U> ->
  core::dict::to_entries(dict)
  |> core::list::map(((key, value)) -> func(key, value))
  |> core::dict::from_entries
in ...
```

The standard-library examples in @iteration:standard-library:dict show further dictionary operations constructed from these primitives.

=== Compiler

HashQL's target backends differ in their support for general control flow and specialised operations. To assign the lowered code to backends, the compiler solves a placement problem over the MIR, as described in the Diplomarbeit @mahmoud2026. We extend the placement solver introduced there to operate on backend-specific regions rather than individual blocks. Recognition algorithms identify regions of code supported by each backend based on the instructions used and the data flow between them. Selecting a region requires all of its member blocks to be placed together. Regions associated with different backends may overlap, but they need not coincide.

This recognition-based approach enables late, backend-specific specialisation and corresponding cost adjustments. It is more flexible than approaches based solely on function identity because the compiler can recognise and specialise code according to its structure. User-defined code can therefore receive the same specialisations as library code without calling a particular library function. The approach also allows a backend to specialise regions whose unspecialised form it could not execute. For example, the PostgreSQL backend can lower a recognised looping region to a containment query even when it cannot execute the loop in its general form.

=== Standard Library <iteration:standard-library>

The following definitions demonstrate the expressiveness of the iteration primitives defined above. Using the preceding definitions, they implement reductions, transformations, searches, and regrouping without introducing a separate iteration construct for each operation.

#note[
  These examples do not constitute a completeness proof for all iteration functions; instead, they illustrate the versatility of the provided primitives.
]

==== List <iteration:standard-library:list>

```hashql
let core::list::split_first = <T>(list: List<T>): (Option<T>, List<T>) ->
  if list is [head, rest @ ..]
  then (Some(head), rest)
  else (None(), list)
in ...

let core::list::split_last = <T>(list: List<T>): (Option<T>, List<T>) ->
  if list is [rest @ .., tail]
  then (Some(tail), rest)
  else (None(), list)
in ...

let core::list::length = <T>(list: List<T>): Integer ->
  core::list::fold(list, 0, (acc, _) -> Continue(acc + 1))
in ...

let core::list::is_empty = <T>(list: List<T>): Boolean ->
  if list is []
  then true
  else false
in ...

let core::list::first = <T>(list: List<T>): Option<T> ->
  list[0]
in ...

let core::list::last = <T>(list: List<T>): Option<T> ->
  if list is [.., tail]
  then Some(tail)
  else None()
in ...

let core::list::rfold = <T, U>(list: List<T>, init: U, step: (U, T) -> ControlFlow<U, U>): U ->
  core::list::fold(core::list::reverse(list), init, step)
in ...

let core::list::reduce = <T>(list: List<T>, func: (T, T) -> T): Option<T> ->
  core::list::fold(list, None(), (acc, item) ->
    match acc
      Some(current) -> Continue(Some(func(current, item)))
      None -> Continue(Some(item))
  )
in ...

let core::list::range = (start: Integer, end: Integer): List<Integer> ->
  match loop(end - start, [], (index, acc) -> Continue(acc ++ [start + index]))
    Continue(acc) -> acc
    Break(acc) -> acc
in ...

let core::list::repeat = <T>(value: T, count: Integer): List<T> ->
  core::list::range(0, count)
  |> core::list::map((_) -> value)
in ...

let core::list::filter = <T>(list: List<T>, predicate: (T) -> Boolean): List<T> ->
  core::list::fold(
    list,
    [],
    (acc, item) ->
      if predicate(item)
      then Continue(acc ++ [item])
      else Continue(acc)
  )
in ...

let core::list::filter_map = <T, U>(list: List<T>, func: (T) -> Option<U>): List<U> ->
  core::list::fold(list, [], (acc, item) ->
    match func(item)
      Some(value) -> Continue(acc ++ [value])
      None -> Continue(acc)
  )
in ...

let core::list::flat_map = <T, U>(list: List<T>, func: (T) -> List<U>): List<U> ->
  core::list::fold(list, [], (acc, item) -> Continue(acc ++ func(item)))
in ...

let core::list::flatten = <T>(list: List<List<T>>): List<T> ->
  core::list::flat_map(list, (inner) -> inner)
in ...

let core::list::reverse = <T>(list: List<T>): List<T> ->
  core::list::fold(list, [], (acc, item) -> Continue([item] ++ acc))
in ...

let core::list::unique = <T>(list: List<T>): List<T> ->
  core::list::fold(list, [], (acc, item) ->
    if core::list::contains(acc, item)
    then Continue(acc)
    else Continue(acc ++ [item])
  )
in ...

let core::list::enumerate = <T>(list: List<T>): List<(Integer, T)> ->
  core::list::fold_map(list, 0, (index, item) -> Continue((index + 1, (index, item)))).1
in ...

let core::list::zip = <T, U>(lhs: List<T>, rhs: List<U>): List<(T, U)> ->
  core::list::fold_map(lhs, 0, (index, item) ->
    match rhs[index]
      Some(other) -> Continue((index + 1, (item, other)))
      None -> Break(index)
  ).1
in ...

let core::list::unzip = <T, U>(list: List<(T, U)>): (List<T>, List<U>) ->
  core::list::fold_map(list, [], (lhs, (left, right)) -> Continue((lhs ++ [left], right)))
in ...

let core::list::take = <T>(list: List<T>, count: Integer): List<T> ->
  core::list::fold_map(list, 0, (taken, item) ->
    if taken < count
    then Continue((taken + 1, item))
    else Break(taken)
  ).1
in ...

let core::list::skip = <T>(list: List<T>, count: Integer): List<T> ->
  core::list::fold(core::list::enumerate(list), [], (acc, (index, item)) ->
    if index < count
    then Continue(acc)
    else Continue(acc ++ [item])
  )
in ...

let core::list::slice = <T>(list: List<T>, start: Integer, end: Integer): List<T> ->
  list
  |> core::list::skip(start)
  |> core::list::take(end - start)
in ...

let core::list::take_while = <T>(list: List<T>, predicate: (T) -> Boolean): List<T> ->
  core::list::fold_map(list, (), (_, item) ->
    if predicate(item)
    then Continue(((), item))
    else Break(())
  ).1
in ...

let core::list::skip_while = <T>(list: List<T>, predicate: (T) -> Boolean): List<T> ->
  core::list::fold(list, (true, []), ((skipping, acc), item) ->
    if skipping && predicate(item)
    then Continue((true, acc))
    else Continue((false, acc ++ [item]))
  ).1
in ...

let core::list::scan = <T, U>(list: List<T>, init: U, step: (U, T) -> U): List<U> ->
  core::list::fold_map(list, init, (acc, item) ->
    let next = step(acc, item) in
    Continue((next, next))
  ).1
in ...

let core::list::chunks = <T>(list: List<T>, size: Integer): List<List<T>> ->
  let (chunks, buffer) = core::list::fold(list, ([], []), ((chunks, buffer), item) ->
    let buffer = buffer ++ [item] in
    if core::list::length(buffer) == size
    then Continue((chunks ++ [buffer], []))
    else Continue((chunks, buffer))
  ) in
  if core::list::is_empty(buffer) then chunks else chunks ++ [buffer]
in ...

let core::list::windows = <T>(list: List<T>, size: Integer): List<List<T>> ->
  core::list::range(0, (core::list::length(list) - size) + 1)
  |> core::list::map((start) -> core::list::slice(list, start, start + size))
in ...

let core::list::partition = <T>(list: List<T>, predicate: (T) -> Boolean): (List<T>, List<T>) ->
  core::list::fold(list, ([], []), ((matched, rest), item) ->
    if predicate(item)
    then Continue((matched ++ [item], rest))
    else Continue((matched, rest ++ [item]))
  )
in ...

let core::list::group_by = <T, K>(list: List<T>, func: (T) -> K): Dict<K, List<T>> ->
  core::list::fold(list, {}, (groups, item) ->
    let
      key = func(item),
      group = match groups[key]
        Some(group) -> group ++ [item]
        None -> [item]
    in
    Continue(core::dict::insert(groups, key, group))
  )
in ...

let core::list::find = <T>(list: List<T>, predicate: (T) -> Boolean): Option<T> ->
  core::list::fold(
    list,
    None(),
    (_, item) ->
      if predicate(item)
      then Break(Some(item))
      else Continue(None())
  )
in ...

let core::list::position = <T>(list: List<T>, predicate: (T) -> Boolean): Option<Integer> ->
  core::list::fold(core::list::enumerate(list), None(), (_, (index, item)) ->
    if predicate(item)
    then Break(Some(index))
    else Continue(None())
  )
in ...

let core::list::any = <T>(list: List<T>, predicate: (T) -> Boolean): Boolean ->
  core::list::fold(
    list,
    false,
    (_, item) ->
      if predicate(item)
      then Break(true)
      else Continue(false)
  )
in ...

let core::list::all = <T>(list: List<T>, predicate: (T) -> Boolean): Boolean ->
  core::list::fold(
    list,
    true,
    (_, item) ->
      if predicate(item)
      then Continue(true)
      else Break(false)
  )
in ...

let core::list::contains = <T>(list: List<T>, value: T): Boolean ->
  core::list::any(list, (item) -> item == value)
in ...

let core::list::count = <T>(list: List<T>, predicate: (T) -> Boolean): Integer ->
  core::list::fold(
    list,
    0,
    (acc, item) -> Continue(
      if predicate(item)
      then acc + 1
      else acc
    )
  )
in ...

let core::list::sum = <T: Number>(list: List<T>): T ->
  core::list::fold(list, 0, (acc, item) -> Continue(acc + item))
in ...

let core::list::product = <T: Number>(list: List<T>): T ->
  core::list::fold(list, 1, (acc, item) -> Continue(acc * item))
in ...

let core::list::min = <T: Number>(list: List<T>): Option<T> ->
  core::list::reduce(list, (lhs, rhs) -> if rhs < lhs then rhs else lhs)
in ...

let core::list::max = <T: Number>(list: List<T>): Option<T> ->
  core::list::reduce(list, (lhs, rhs) -> if rhs > lhs then rhs else lhs)
in ...
```

==== Dict <iteration:standard-library:dict>

```hashql
let core::dict::keys = <K, V>(dict: Dict<K, V>): List<K> ->
  core::dict::to_entries(dict)
  |> core::list::map(((key, _)) -> key)
in ...

let core::dict::values = <K, V>(dict: Dict<K, V>): List<V> ->
  core::dict::to_entries(dict)
  |> core::list::map(((_, value)) -> value)
in ...

let core::dict::length = <K, V>(dict: Dict<K, V>): Integer ->
  core::dict::fold(dict, 0, (acc, _, _) -> Continue(acc + 1))
in ...

let core::dict::is_empty = <K, V>(dict: Dict<K, V>): Boolean ->
  if dict is {}
  then true
  else false
in ...

let core::dict::contains_key = <K, V>(dict: Dict<K, V>, key: K): Boolean ->
  match dict[key]
    Some(_) -> true
    None -> false
in ...

let core::dict::insert = <K, V>(dict: Dict<K, V>, key: K, value: V): Dict<K, V> ->
  core::dict::from_entries(core::dict::to_entries(dict) ++ [(key, value)])
in ...

let core::dict::remove = <K, V>(dict: Dict<K, V>, key: K): Dict<K, V> ->
  core::dict::filter(dict, (existing, _) -> existing != key)
in ...

let core::dict::merge = <K, V>(lhs: Dict<K, V>, rhs: Dict<K, V>): Dict<K, V> ->
  core::dict::from_entries(core::dict::to_entries(lhs) ++ core::dict::to_entries(rhs))
in ...

let core::dict::filter = <K, V>(
  dict: Dict<K, V>,
  predicate: (K, V) -> Boolean,
): Dict<K, V> ->
  core::dict::to_entries(dict)
  |> core::list::filter(((key, value)) -> predicate(key, value))
  |> core::dict::from_entries
in ...

let core::dict::filter_map = <K, V, U>(
  dict: Dict<K, V>,
  func: (K, V) -> Option<U>,
): Dict<K, U> ->
  core::dict::to_entries(dict)
  |> core::list::filter_map(((key, value)) ->
    match func(key, value)
      Some(mapped) -> Some((key, mapped))
      None -> None()
  )
  |> core::dict::from_entries
in ...

let core::dict::partition = <K, V>(
  dict: Dict<K, V>,
  predicate: (K, V) -> Boolean,
): (Dict<K, V>, Dict<K, V>) ->
  let (matched, rest) = core::dict::to_entries(dict)
    |> core::list::partition(((key, value)) -> predicate(key, value))
  in
  (core::dict::from_entries(matched), core::dict::from_entries(rest))
in ...

let core::dict::find = <K, V>(
  dict: Dict<K, V>,
  predicate: (K, V) -> Boolean,
): Option<(K, V)> ->
  core::dict::fold(dict, None(), (_, key, value) ->
    if predicate(key, value)
    then Break(Some((key, value)))
    else Continue(None())
  )
in ...

let core::dict::any = <K, V>(
  dict: Dict<K, V>,
  predicate: (K, V) -> Boolean,
): Boolean ->
  core::dict::fold(dict, false, (_, key, value) ->
    if predicate(key, value)
    then Break(true)
    else Continue(false)
  )
in ...

let core::dict::all = <K, V>(
  dict: Dict<K, V>,
  predicate: (K, V) -> Boolean,
): Boolean ->
  core::dict::fold(dict, true, (_, key, value) ->
    if predicate(key, value)
    then Continue(true)
    else Break(false)
  )
in ...
```
