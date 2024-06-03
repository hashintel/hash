export type OmitValue<T, K> = T extends K ? never : T;
