export type Float = number;
export type Double = number;
export type Int32 = number;
export type Int64 = number;
export type UInt32 = number;
export type UInt64 = number;
export type Class = abstract new (...args: any[]) => unknown;

/** This class is necessary to make class search work, see {@link ClassAnalyzer} for details. */
export class Typings {}