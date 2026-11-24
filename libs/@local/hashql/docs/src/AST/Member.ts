import type * as Accessor from "./Accessor.js";
import type * as CallSignature from "./CallSignature.js";
import type * as Constructor from "./Constructor.js";
import type * as ConstructSignature from "./ConstructSignature.js";
import type * as EnumMember from "./EnumMember.js";
import type * as IndexSignature from "./IndexSignature.js";
import type * as $Interned from "./Interned.js";
import type * as Method from "./Method.js";
import type * as Property from "./Property.js";

export type Member = Member.Type | Member.Class | EnumMember.EnumMember;

export declare namespace Member {
  type Type =
    | Property.Property
    | Method.Method
    | Accessor.Accessor
    | CallSignature.CallSignature
    | ConstructSignature.ConstructSignature
    | IndexSignature.IndexSignature;

  type Class =
    | Property.Property
    | Method.Method
    | Accessor.Accessor
    | Constructor.Constructor
    | IndexSignature.IndexSignature;
}

export type Interned = $Interned.Interned<Member>;

/** The identity of a member an interface or a type literal declares. */
export type InternedType = $Interned.Interned<Member.Type>;

/** The identity of a member a class declares. */
export type InternedClass = $Interned.Interned<Member.Class>;
