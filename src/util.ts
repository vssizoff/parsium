// export const oneOf = <T extends readonly unknown[]>(values: T): Parser<T[number]> =>
//     (value, path) => {
//         for (const allowedValue of values) {
//             if (value === allowedValue) {
//                 return value as T[number];
//             }
//         }
//
//         throw new ParsingError(`[${path}] isn't equal to any of the expected values`);
//     };
//
// export const alternatives = <T>(parsers: Parser<T>[]): Parser<T> =>
//     (value, path) => {
//         const errors: string[] = [];
//
//         parsers.forEach((parser, i) => {
//             try {
//                 return parser(value, path);
//             } catch (err) {
//                 if (err instanceof ParsingError) {
//                     errors.push(`  ${i}: ${err.message}`);
//                 }
//             }
//         });
//
//         throw new ParsingError(`[${path}] doesn't match any of allowed alternatives:\n${errors.join('\n')}`);
//     };
//
// export const optional = <T>(parser: Parser<T>): Parser<T | undefined> =>
//     (value, path) => {
//         if (value === undefined) {
//             return undefined;
//         }
//
//         return parser(value, path);
//     };
//
// export const nullable = <T>(parser: Parser<T>): Parser<T | null> =>
//     (value, path) => {
//         if (value === null) {
//             return null;
//         }
//
//         return parser(value, path);
//     };
//
// export const defaultValue = <T>(defaultValue: T, parser: Parser<T>): Parser<T> =>
//     (value, path) => {
//         if (value === undefined) {
//             return defaultValue;
//         }
//
//         return parser(value, path);
//     };
//
// export const uuid = (): Parser<string> =>
//     (value, path) => {
//         const strValue = string()(value, path);
//
//         // UUID regex pattern (v1-v5)
//         const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
//
//         if (!uuidPattern.test(strValue)) {
//             throw new ParsingError(`[${path}] is not a valid UUID`);
//         }
//
//         return strValue;
//     };
//
// export const email = (): Parser<string> =>
//     (value, path) => {
//         const strValue = string()(value, path);
//
//         // Email regex pattern
//         const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
//
//         if (!emailPattern.test(strValue)) {
//             throw new ParsingError(`[${path}] is not a valid email`);
//         }
//
//         return strValue;
//     };
//
// export const any = <T>(): Parser<T> =>
//     (value, _path) => value as T;
//
// export const transform = <T, U>(parser: Parser<T>, transformer: (value: T) => U): Parser<U> =>
//     (value, path) => {
//         const parsed = parser(value, path);
//         return transformer(parsed);
//     };