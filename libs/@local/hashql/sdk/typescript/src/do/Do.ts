import type * as Expression from "../Program/Expression.js";
import type * as Input from "../Program/Inputs.js";
import type * as ProgramError from "../Program/ProgramError.js";
import type * as Scope from "../Program/Scope.js";
import type * as Type from "../Type/index.js";
import type * as Node from "./Node.js";
import type { Body } from "./Utilities.js";
import type { Result } from "effect";

/**
 * The call signatures of a Do block constructor whose blocks start in the scope `Initial`.
 *
 * Each overload threads the scope through zero to eight declaration steps, so every step and the final body see the names the earlier steps introduced. The result's input requirements combine those of every step with the body's. For more than eight steps, continue in a nested block started from a callback's `$`.
 */
export interface Do<Initial extends Scope.Scope> {
  <T extends Type.Any, Inputs>(
    body: Body<Initial, T, Inputs>,
  ): Result.Result<
    Expression.Expression<T, Input.All<readonly [Inputs]>>,
    ProgramError.Construction
  >;
  <S1 extends Scope.Scope, I1, T extends Type.Any, Inputs>(
    step1: Node.Node<Initial, S1, I1>,
    body: Body<S1, T, Inputs>,
  ): Result.Result<
    Expression.Expression<T, Input.All<readonly [I1, Inputs]>>,
    ProgramError.Construction
  >;
  <
    S1 extends Scope.Scope,
    I1,
    S2 extends Scope.Scope,
    I2,
    T extends Type.Any,
    Inputs,
  >(
    step1: Node.Node<Initial, S1, I1>,
    step2: Node.Node<S1, S2, I2>,
    body: Body<S2, T, Inputs>,
  ): Result.Result<
    Expression.Expression<T, Input.All<readonly [I1, I2, Inputs]>>,
    ProgramError.Construction
  >;
  <
    S1 extends Scope.Scope,
    I1,
    S2 extends Scope.Scope,
    I2,
    S3 extends Scope.Scope,
    I3,
    T extends Type.Any,
    Inputs,
  >(
    step1: Node.Node<Initial, S1, I1>,
    step2: Node.Node<S1, S2, I2>,
    step3: Node.Node<S2, S3, I3>,
    body: Body<S3, T, Inputs>,
  ): Result.Result<
    Expression.Expression<T, Input.All<readonly [I1, I2, I3, Inputs]>>,
    ProgramError.Construction
  >;
  <
    S1 extends Scope.Scope,
    I1,
    S2 extends Scope.Scope,
    I2,
    S3 extends Scope.Scope,
    I3,
    S4 extends Scope.Scope,
    I4,
    T extends Type.Any,
    Inputs,
  >(
    step1: Node.Node<Initial, S1, I1>,
    step2: Node.Node<S1, S2, I2>,
    step3: Node.Node<S2, S3, I3>,
    step4: Node.Node<S3, S4, I4>,
    body: Body<S4, T, Inputs>,
  ): Result.Result<
    Expression.Expression<T, Input.All<readonly [I1, I2, I3, I4, Inputs]>>,
    ProgramError.Construction
  >;
  <
    S1 extends Scope.Scope,
    I1,
    S2 extends Scope.Scope,
    I2,
    S3 extends Scope.Scope,
    I3,
    S4 extends Scope.Scope,
    I4,
    S5 extends Scope.Scope,
    I5,
    T extends Type.Any,
    Inputs,
  >(
    step1: Node.Node<Initial, S1, I1>,
    step2: Node.Node<S1, S2, I2>,
    step3: Node.Node<S2, S3, I3>,
    step4: Node.Node<S3, S4, I4>,
    step5: Node.Node<S4, S5, I5>,
    body: Body<S5, T, Inputs>,
  ): Result.Result<
    Expression.Expression<T, Input.All<readonly [I1, I2, I3, I4, I5, Inputs]>>,
    ProgramError.Construction
  >;
  <
    S1 extends Scope.Scope,
    I1,
    S2 extends Scope.Scope,
    I2,
    S3 extends Scope.Scope,
    I3,
    S4 extends Scope.Scope,
    I4,
    S5 extends Scope.Scope,
    I5,
    S6 extends Scope.Scope,
    I6,
    T extends Type.Any,
    Inputs,
  >(
    step1: Node.Node<Initial, S1, I1>,
    step2: Node.Node<S1, S2, I2>,
    step3: Node.Node<S2, S3, I3>,
    step4: Node.Node<S3, S4, I4>,
    step5: Node.Node<S4, S5, I5>,
    step6: Node.Node<S5, S6, I6>,
    body: Body<S6, T, Inputs>,
  ): Result.Result<
    Expression.Expression<
      T,
      Input.All<readonly [I1, I2, I3, I4, I5, I6, Inputs]>
    >,
    ProgramError.Construction
  >;
  <
    S1 extends Scope.Scope,
    I1,
    S2 extends Scope.Scope,
    I2,
    S3 extends Scope.Scope,
    I3,
    S4 extends Scope.Scope,
    I4,
    S5 extends Scope.Scope,
    I5,
    S6 extends Scope.Scope,
    I6,
    S7 extends Scope.Scope,
    I7,
    T extends Type.Any,
    Inputs,
  >(
    step1: Node.Node<Initial, S1, I1>,
    step2: Node.Node<S1, S2, I2>,
    step3: Node.Node<S2, S3, I3>,
    step4: Node.Node<S3, S4, I4>,
    step5: Node.Node<S4, S5, I5>,
    step6: Node.Node<S5, S6, I6>,
    step7: Node.Node<S6, S7, I7>,
    body: Body<S7, T, Inputs>,
  ): Result.Result<
    Expression.Expression<
      T,
      Input.All<readonly [I1, I2, I3, I4, I5, I6, I7, Inputs]>
    >,
    ProgramError.Construction
  >;
  <
    S1 extends Scope.Scope,
    I1,
    S2 extends Scope.Scope,
    I2,
    S3 extends Scope.Scope,
    I3,
    S4 extends Scope.Scope,
    I4,
    S5 extends Scope.Scope,
    I5,
    S6 extends Scope.Scope,
    I6,
    S7 extends Scope.Scope,
    I7,
    S8 extends Scope.Scope,
    I8,
    T extends Type.Any,
    Inputs,
  >(
    step1: Node.Node<Initial, S1, I1>,
    step2: Node.Node<S1, S2, I2>,
    step3: Node.Node<S2, S3, I3>,
    step4: Node.Node<S3, S4, I4>,
    step5: Node.Node<S4, S5, I5>,
    step6: Node.Node<S5, S6, I6>,
    step7: Node.Node<S6, S7, I7>,
    step8: Node.Node<S7, S8, I8>,
    body: Body<S8, T, Inputs>,
  ): Result.Result<
    Expression.Expression<
      T,
      Input.All<readonly [I1, I2, I3, I4, I5, I6, I7, I8, Inputs]>
    >,
    ProgramError.Construction
  >;
}
