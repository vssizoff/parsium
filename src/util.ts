import {createParser, type Parser, ParsingError} from "./base.js";
import {string} from "./basic.js";

export const oneOf = <T extends readonly unknown[]>(
    values: T
) => createParser((value, path): T[number] => {
    for (const allowedValue of values) {
        if (value === allowedValue) {
            return value as T[number];
        }
    }

    throw new ParsingError(`[${path ?? ""}] isn't equal to any of the expected values`);
});

export const alternatives = <T extends readonly [...Parser<unknown>[]]>(
    ...parsers: T
) => createParser((value, path): { [K in keyof T]: T[K] extends Parser<infer U> ? U : never }[number] => {
    const errors: Array<ParsingError> = [];

    for (const parser of parsers) {
        try {
            return parser(value, path) as { [K in keyof T]: T[K] extends Parser<infer U> ? U : never }[number];
        } catch (error) {
            if (error instanceof ParsingError) {
                errors.push(error);
            }
            else {
                throw error;
            }
        }
    }

    throw new ParsingError(`[${path}] doesn't match any of allowed alternatives:\n${errors.map(error => error.message).join('\n')}`);
});

export const optional = <T>(parser: Parser<T>
) => createParser((value, path) => {
    if (value === undefined) {
        return undefined;
    }

    if (value === null) {
        return null;
    }

    return parser(value, path);
});

export const nullable = <T>(parser: Parser<T>
) => createParser((value, path) => {
    if (value === null) {
        return null;
    }

    return parser(value, path);
});

export const defaultValue = <T>(defaultValue: T, parser: Parser<T>
) => createParser((value, path) => {
    if (value === undefined || value === null) {
        return defaultValue;
    }

    return parser(value, path);
});

export const uuid = () => createParser((value, path) => {
    const strValue = string()(value, path);

    // UUID regex pattern (v1-v5)
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    if (!uuidPattern.test(strValue)) {
        throw new ParsingError(`[${path ?? ""}] is not a valid UUID`);
    }

    return strValue;
});

export const email = () => createParser((value, path) => {
    const strValue = string()(value, path);

    // Email regex pattern
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailPattern.test(strValue)) {
        throw new ParsingError(`[${path ?? ""}] is not a valid email`);
    }

    return strValue;
});

export const any = <T>() => createParser((value, _path) => value as T);

export const transform = <T, U>(
    parser: Parser<T>,
    transformer: (value: T) => U
) => createParser((value, path) => {
    const parsed = parser(value, path);
    return transformer(parsed);
});