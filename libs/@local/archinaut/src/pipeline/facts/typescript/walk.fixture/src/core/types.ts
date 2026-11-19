export interface Token {
  id: string;
  kind: "place" | "transition";
}

export const describe = (token: Token): string => `${token.kind} ${token.id}`;

const hidden = 1;
export { hidden as exposed };
