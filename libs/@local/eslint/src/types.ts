export interface NoRestrictedImportsRule {
  paths: (string | ValidNoRestrictedImportPathOptions)[];
  patterns: (string | ValidNoRestrictedImportPatternOptions)[];
}

export interface NormalizedNoRestrictedImportsRule {
  paths: (string | ValidNoRestrictedImportPathOptions)[];
  patterns: ValidNoRestrictedImportPatternOptions[];
}

interface NoRestrictedImportPathCommonOptions {
  name: string;
  message?: string;
  allowTypeImports?: boolean;
}

export type EitherImportNamesOrAllowImportName =
  | { importNames?: string[]; allowImportNames?: never }
  | { allowImportNames?: string[]; importNames?: never };

export type ValidNoRestrictedImportPathOptions =
  NoRestrictedImportPathCommonOptions & EitherImportNamesOrAllowImportName;

export interface NoRestrictedImportPatternCommonOptions {
  message?: string;
  caseSensitive?: boolean;
}

// Base type for group or regex constraint, ensuring mutual exclusivity
export type EitherGroupOrRegEx =
  | { group: string[]; regex?: never }
  | { regex: string; group?: never };

// Base type for import name specifiers, ensuring mutual exclusivity
export type EitherNameSpecifiers =
  | {
      importNames: string[];
      allowImportNames?: never;
      importNamePattern?: never;
      allowImportNamePattern?: never;
    }
  | {
      importNamePattern: string;
      allowImportNames?: never;
      importNames?: never;
      allowImportNamePattern?: never;
    }
  | {
      allowImportNames: string[];
      importNames?: never;
      importNamePattern?: never;
      allowImportNamePattern?: never;
    }
  | {
      allowImportNamePattern: string;
      importNames?: never;
      allowImportNames?: never;
      importNamePattern?: never;
    };

// Adds oneOf and not constraints, ensuring group or regex are present and mutually exclusive sets for importNames, allowImportNames, etc., as per the schema.
export type ValidNoRestrictedImportPatternOptions =
  NoRestrictedImportPatternCommonOptions &
    EitherGroupOrRegEx &
    EitherNameSpecifiers;
