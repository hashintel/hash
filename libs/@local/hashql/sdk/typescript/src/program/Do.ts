import type * as Type from "../type/index.js";
import type * as Expression from "./Expression.js";
import type * as Input from "./Inputs.js";
import type * as IR from "./ir/index.js";
import type * as ProgramError from "./ProgramError.js";
import type { Body } from "./Utilities.js";
import type { Result } from "effect";

/** Contextual overloads propagate the output universes and accumulate every declaration's inputs. */
export interface Do<Initial extends IR.Scope.Scope> {
  <T extends Type.Any, Inputs>(
    body: Body<Initial, T, Inputs>,
  ): Result.Result<
    Expression.Expression<T, Input.All<readonly [Inputs]>>,
    ProgramError.Construction
  >;
  <S1 extends IR.Scope.Scope, I1, T extends Type.Any, Inputs>(
    step1: IR.Node.Node<Initial, S1, I1>,
    body: Body<S1, T, Inputs>,
  ): Result.Result<
    Expression.Expression<T, Input.All<readonly [I1, Inputs]>>,
    ProgramError.Construction
  >;
  <
    S1 extends IR.Scope.Scope,
    I1,
    S2 extends IR.Scope.Scope,
    I2,
    T extends Type.Any,
    Inputs,
  >(
    step1: IR.Node.Node<Initial, S1, I1>,
    step2: IR.Node.Node<S1, S2, I2>,
    body: Body<S2, T, Inputs>,
  ): Result.Result<
    Expression.Expression<T, Input.All<readonly [I1, I2, Inputs]>>,
    ProgramError.Construction
  >;
  <
    S1 extends IR.Scope.Scope,
    I1,
    S2 extends IR.Scope.Scope,
    I2,
    S3 extends IR.Scope.Scope,
    I3,
    T extends Type.Any,
    Inputs,
  >(
    step1: IR.Node.Node<Initial, S1, I1>,
    step2: IR.Node.Node<S1, S2, I2>,
    step3: IR.Node.Node<S2, S3, I3>,
    body: Body<S3, T, Inputs>,
  ): Result.Result<
    Expression.Expression<T, Input.All<readonly [I1, I2, I3, Inputs]>>,
    ProgramError.Construction
  >;
  <
    S1 extends IR.Scope.Scope,
    I1,
    S2 extends IR.Scope.Scope,
    I2,
    S3 extends IR.Scope.Scope,
    I3,
    S4 extends IR.Scope.Scope,
    I4,
    T extends Type.Any,
    Inputs,
  >(
    step1: IR.Node.Node<Initial, S1, I1>,
    step2: IR.Node.Node<S1, S2, I2>,
    step3: IR.Node.Node<S2, S3, I3>,
    step4: IR.Node.Node<S3, S4, I4>,
    body: Body<S4, T, Inputs>,
  ): Result.Result<
    Expression.Expression<T, Input.All<readonly [I1, I2, I3, I4, Inputs]>>,
    ProgramError.Construction
  >;
  <
    S1 extends IR.Scope.Scope,
    I1,
    S2 extends IR.Scope.Scope,
    I2,
    S3 extends IR.Scope.Scope,
    I3,
    S4 extends IR.Scope.Scope,
    I4,
    S5 extends IR.Scope.Scope,
    I5,
    T extends Type.Any,
    Inputs,
  >(
    step1: IR.Node.Node<Initial, S1, I1>,
    step2: IR.Node.Node<S1, S2, I2>,
    step3: IR.Node.Node<S2, S3, I3>,
    step4: IR.Node.Node<S3, S4, I4>,
    step5: IR.Node.Node<S4, S5, I5>,
    body: Body<S5, T, Inputs>,
  ): Result.Result<
    Expression.Expression<T, Input.All<readonly [I1, I2, I3, I4, I5, Inputs]>>,
    ProgramError.Construction
  >;
  <
    S1 extends IR.Scope.Scope,
    I1,
    S2 extends IR.Scope.Scope,
    I2,
    S3 extends IR.Scope.Scope,
    I3,
    S4 extends IR.Scope.Scope,
    I4,
    S5 extends IR.Scope.Scope,
    I5,
    S6 extends IR.Scope.Scope,
    I6,
    T extends Type.Any,
    Inputs,
  >(
    step1: IR.Node.Node<Initial, S1, I1>,
    step2: IR.Node.Node<S1, S2, I2>,
    step3: IR.Node.Node<S2, S3, I3>,
    step4: IR.Node.Node<S3, S4, I4>,
    step5: IR.Node.Node<S4, S5, I5>,
    step6: IR.Node.Node<S5, S6, I6>,
    body: Body<S6, T, Inputs>,
  ): Result.Result<
    Expression.Expression<
      T,
      Input.All<readonly [I1, I2, I3, I4, I5, I6, Inputs]>
    >,
    ProgramError.Construction
  >;
  <
    S1 extends IR.Scope.Scope,
    I1,
    S2 extends IR.Scope.Scope,
    I2,
    S3 extends IR.Scope.Scope,
    I3,
    S4 extends IR.Scope.Scope,
    I4,
    S5 extends IR.Scope.Scope,
    I5,
    S6 extends IR.Scope.Scope,
    I6,
    S7 extends IR.Scope.Scope,
    I7,
    T extends Type.Any,
    Inputs,
  >(
    step1: IR.Node.Node<Initial, S1, I1>,
    step2: IR.Node.Node<S1, S2, I2>,
    step3: IR.Node.Node<S2, S3, I3>,
    step4: IR.Node.Node<S3, S4, I4>,
    step5: IR.Node.Node<S4, S5, I5>,
    step6: IR.Node.Node<S5, S6, I6>,
    step7: IR.Node.Node<S6, S7, I7>,
    body: Body<S7, T, Inputs>,
  ): Result.Result<
    Expression.Expression<
      T,
      Input.All<readonly [I1, I2, I3, I4, I5, I6, I7, Inputs]>
    >,
    ProgramError.Construction
  >;
  <
    S1 extends IR.Scope.Scope,
    I1,
    S2 extends IR.Scope.Scope,
    I2,
    S3 extends IR.Scope.Scope,
    I3,
    S4 extends IR.Scope.Scope,
    I4,
    S5 extends IR.Scope.Scope,
    I5,
    S6 extends IR.Scope.Scope,
    I6,
    S7 extends IR.Scope.Scope,
    I7,
    S8 extends IR.Scope.Scope,
    I8,
    T extends Type.Any,
    Inputs,
  >(
    step1: IR.Node.Node<Initial, S1, I1>,
    step2: IR.Node.Node<S1, S2, I2>,
    step3: IR.Node.Node<S2, S3, I3>,
    step4: IR.Node.Node<S3, S4, I4>,
    step5: IR.Node.Node<S4, S5, I5>,
    step6: IR.Node.Node<S5, S6, I6>,
    step7: IR.Node.Node<S6, S7, I7>,
    step8: IR.Node.Node<S7, S8, I8>,
    body: Body<S8, T, Inputs>,
  ): Result.Result<
    Expression.Expression<
      T,
      Input.All<readonly [I1, I2, I3, I4, I5, I6, I7, I8, Inputs]>
    >,
    ProgramError.Construction
  >;
}
