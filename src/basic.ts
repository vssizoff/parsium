import {createParser, ParsingError} from "./base.js";

export const buffer = () => createParser((value, path): Buffer => {
    if (Buffer.isBuffer(value)) return value;

    // string -> Buffer (defaults to utf8)
    if (typeof value === 'string') {
        return Buffer.from(value);
    }

    // ArrayBuffer -> Buffer
    if (value instanceof ArrayBuffer) {
        return Buffer.from(new Uint8Array(value));
    }

    // TypedArray / DataView (ArrayBufferView)
    if (ArrayBuffer.isView(value)) {
        return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
    }

    // Array<number> of bytes
    if (Array.isArray(value) && value.every(v => Number.isInteger(v) && v >= 0 && v <= 255)) {
        return Buffer.from(value as number[]);
    }

    // Serialized Node Buffer object: { type: 'Buffer', data: number[] }
    if (value && typeof value === 'object' && (value as any).type === 'Buffer' && Array.isArray((value as any).data)) {
        return Buffer.from((value as any).data);
    }

    throw new ParsingError(`[${path ?? ""}] cannot be converted to a Buffer`, [{path, issue: "cannot be converted to a Buffer", rejectedValue: null}]);
});

export const string = (options: { min?: number; max?: number; pattern?: RegExp } = {}) => createParser((value, path): string => {
    let strValue: string;

    if (typeof value === 'string') {
        strValue = value;
    }
    else if (typeof value === 'number') {
        strValue = value.toString();
    }
    else {
        try {
            strValue = buffer()(value, path).toString();
        }
        catch (error) {
            throw new ParsingError(`[${path ?? ""}] cannot be converted to a string`, [{path, issue: "cannot be converted to a string", rejectedValue: null}]);
        }
    }

    if (options.min !== undefined && strValue.length < options.min) {
        throw new ParsingError(`[length(${path ?? ""})] is less than the allowed minimum (${options.min})`, [{path, issue: `less than the allowed minimum (${options.min})`, rejectedValue: strValue.length}]);
    }
    if (options.max !== undefined && strValue.length > options.max) {
        throw new ParsingError(`[length(${path ?? ""})] is larger than the allowed maximum (${options.max})`, [{path, issue: `larger than the allowed maximum (${options.max})`, rejectedValue: strValue.length}]);
    }
    if (options.pattern && !options.pattern.test(strValue)) {
        throw new ParsingError(`[${path ?? ""}] doesn't match the pattern`, [{path, issue: `doesn't match the pattern`, rejectedValue: strValue}]);
    }

    return strValue;
});

export const int = (options: { min?: number; max?: number } = {}) => createParser((value, path): number => {
    let numValue: number;

    if (typeof value === 'number') {
        numValue = value;
    }
    else {
        try {
            numValue = parseFloat(string()(value, path));
        }
        catch (error) {
            throw new ParsingError(`[${path ?? ""}] cannot be parsed as integer`, [{path, issue: "cannot be parsed as integer", rejectedValue: null}]);
        }
    }

    if (!Number.isInteger(numValue) || Number.isNaN(numValue)) {
        throw new ParsingError(`[${path ?? ""}] cannot be parsed as integer`, [{path, issue: "cannot be parsed as integer", rejectedValue: null}]);
    }

    if (options.min !== undefined && numValue < options.min) {
        throw new ParsingError(`[${path ?? ""}] is less than the allowed minimum (${options.min})`, [{path, issue: `less than the allowed minimum (${options.min})`, rejectedValue: numValue}]);
    }
    if (options.max !== undefined && numValue > options.max) {
        throw new ParsingError(`[${path ?? ""}] is larger than the allowed maximum (${options.max})`, [{path, issue: `larger than the allowed maximum (${options.max})`, rejectedValue: numValue}]);
    }

    return numValue;
});

export const float = (options: { min?: number; max?: number } = {}) => createParser((value, path): number => {
    let numValue: number;

    if (typeof value === 'number') {
        numValue = value;
    }
    else {
        try {
            numValue = parseFloat(string()(value, path));
        }
        catch (error) {
            throw new ParsingError(`[${path ?? ""}] cannot be parsed as float`, [{path, issue: "cannot be parsed as float", rejectedValue: null}]);
        }
    }

    if (!Number.isFinite(numValue) || Number.isNaN(numValue)) {
        throw new ParsingError(`[${path ?? ""}] cannot be parsed as float`, [{path, issue: "cannot be parsed as float", rejectedValue: null}]);
    }

    if (options.min !== undefined && numValue < options.min) {
        throw new ParsingError(`[${path ?? ""}] is less than the allowed minimum (${options.min})`, [{path, issue: `less than the allowed minimum (${options.min})`, rejectedValue: numValue}]);
    }
    if (options.max !== undefined && numValue > options.max) {
        throw new ParsingError(`[${path ?? ""}] is larger than the allowed maximum (${options.max})`, [{path, issue: `larger than the allowed maximum (${options.max})`, rejectedValue: numValue}]);
    }

    return numValue;
});

export const boolean = () => createParser((value, path): boolean => {
    if (typeof value === 'boolean') {
        return value;
    }
    else if (typeof value === 'number') {
        if (value === 1) return true;
        if (value === 0) return false;
    }
    else {
        try {
            const lowerValue = string()(value, path).toLowerCase();
            if (lowerValue === 'true' || lowerValue === '1' || lowerValue === 'yes') {
                return true;
            }
            else if (lowerValue === 'false' || lowerValue === '0' || lowerValue === 'no') {
                return false;
            }
        }
        catch (error) {}
    }

    throw new ParsingError(`[${path}] cannot be converted to boolean`, [{path, issue: "cannot be converted to boolean", rejectedValue: null}]);
})