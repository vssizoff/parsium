import * as os from 'os';
import * as fs from 'fs';
import * as Path from 'path';
import Busboy from 'busboy';
import cryptoRandomString from "crypto-random-string";
import {parseFormData} from "./formdata.js";
import {Readable} from "node:stream";

interface File extends Partial<Busboy.FileInfo> {
    size: number;

    append(buffer: Buffer): Promise<void>;
    read(): Promise<Buffer>;
    save(path: string): Promise<void>;

    appendSync(buffer: Buffer): void;
    readSync(): Buffer;
    saveSync(path: string): void;

    createReadStream(): NodeJS.ReadableStream;
}

class RAMFile implements File {
    filename?: string;
    encoding?: string;
    mimeType?: string;
    public size: number = 0;
    private data: Buffer = Buffer.alloc(0);

    constructor(fileInfo?: Busboy.FileInfo) {
        this.filename = fileInfo?.filename;
        this.encoding = fileInfo?.encoding;
        this.mimeType = fileInfo?.mimeType;
    }

    public async append(buffer: Buffer): Promise<void> {
        this.appendSync(buffer);
    }

    public appendSync(buffer: Buffer): void {
        this.size += buffer.byteLength;
        this.data = Buffer.concat([this.data, buffer]);
    }

    public async read(): Promise<Buffer> {
        return this.readSync();
    }

    public readSync(): Buffer {
        return this.data;
    }

    public async save(path: string): Promise<void> {
        await fs.promises.writeFile(path, this.data);
    }

    public saveSync(path: string): void {
        fs.writeFileSync(path, this.data);
    }

    createReadStream(): NodeJS.ReadableStream {
        return Readable.from(this.data);
    }
}

class TempFile implements File {
    filename?: string;
    encoding?: string;
    mimeType?: string;

    constructor(private path: string, public size: number, fileInfo?: Busboy.FileInfo) {
        this.filename = fileInfo?.filename;
        this.encoding = fileInfo?.encoding;
        this.mimeType = fileInfo?.mimeType;
    }

    public async append(buffer: Buffer): Promise<void> {
        this.size += buffer.byteLength;
        await fs.promises.appendFile(this.path, buffer);
    }

    public appendSync(buffer: Buffer): void {
        this.size += buffer.byteLength;
        fs.appendFileSync(this.path, buffer);
    }

    public async read(): Promise<Buffer> {
        return fs.promises.readFile(this.path);
    }

    public readSync(): Buffer {
        return fs.readFileSync(this.path);
    }

    public async save(path: string): Promise<void> {
        await fs.promises.copyFile(this.path, path);
    }

    public saveSync(path: string): void {
        fs.copyFileSync(this.path, path);
    }

    public getPath(): string {
        return this.path;
    }

    createReadStream(): NodeJS.ReadableStream {
        return fs.createReadStream(this.path);
    }
}

export const anyField = Symbol("anyField");

export class ParsingError extends Error {
    name = 'ParsingError';

    constructor(message: string) {
        super(message);
        Object.setPrototypeOf(this, ParsingError.prototype);
    }
}

export type RawParser<T> = (value: unknown, path?: string) => T;
export type StreamParser<T> = (value: NodeJS.ReadableStream, path?: string) => Promise<T>;
export type Parser<T> = RawParser<T> & {stream: StreamParser<T>};

export async function streamToBuffer(stream: NodeJS.ReadableStream) {
    return new Promise((resolve, reject) => {
        let data = Buffer.alloc(0);
        stream.on('data', (chunk: Buffer) => {
            data = Buffer.concat([data, chunk])
        });
        stream.on('end', () => {
            resolve(data);
        });
        stream.on('error', (err: Error) => {
            reject(err);
        });
    })
}

export function createParser<T>(parser: RawParser<T>, streamParser?: (parser: RawParser<T>) => StreamParser<T>): Parser<T> {
    if (!streamParser) return createParser(parser, parser_ => async (stream, path): Promise<T> => parser_(await streamToBuffer(stream), path));
    const parserFn = (value: unknown, path?: string): T => parser(value, path);
    parserFn.stream = streamParser(parser);
    return parserFn as Parser<T>;
}

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

    throw new ParsingError(`[${path ?? ""}] cannot be converted to a Buffer`);
});

export const file = (options?: {max?: number}) => createParser((value, path): File => {
    if (value instanceof RAMFile || value instanceof TempFile) return value;
    let file = new RAMFile();
    file.appendSync(buffer()(value, path));
    return file;
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
            throw new ParsingError(`[${path ?? ""}] cannot be converted to a string`);
        }
    }

    if (options.min !== undefined && strValue.length < options.min) {
        throw new ParsingError(`[length(${path ?? ""})] is less than the allowed minimum (${options.min})`);
    }
    if (options.max !== undefined && strValue.length > options.max) {
        throw new ParsingError(`[length(${path ?? ""})] is larger than the allowed maximum (${options.max})`);
    }
    if (options.pattern && !options.pattern.test(strValue)) {
        throw new ParsingError(`[${path ?? ""}] doesn't match the pattern`);
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
            numValue = parseInt(string()(value, path));
        }
        catch (error) {
            throw new ParsingError(`[${path ?? ""}] cannot be parsed as integer`);
        }
    }

    if (!Number.isInteger(numValue) || Number.isNaN(numValue)) {
        throw new ParsingError(`[${path ?? ""}] should be an integer`);
    }

    if (options.min !== undefined && numValue < options.min) {
        throw new ParsingError(`[${path ?? ""}] is less than the allowed minimum (${options.min})`);
    }
    if (options.max !== undefined && numValue > options.max) {
        throw new ParsingError(`[${path ?? ""}] is larger than the allowed maximum (${options.max})`);
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
            throw new ParsingError(`[${path ?? ""}] cannot be parsed as float`);
        }
    }

    if (!Number.isFinite(numValue) || Number.isNaN(numValue)) {
        throw new ParsingError(`[${path} ?? ""] should be an float`);
    }

    if (options.min !== undefined && numValue < options.min) {
        throw new ParsingError(`[${path ?? ""}] is less than the allowed minimum (${options.min})`);
    }
    if (options.max !== undefined && numValue > options.max) {
        throw new ParsingError(`[${path ?? ""}] is larger than the allowed maximum (${options.max})`);
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

    throw new ParsingError(`[${path}] cannot be converted to boolean`);
})

async function parseFormDataStream<T extends Record<string, unknown>>(
    stream: NodeJS.ReadableStream,
    shape: { [K in keyof T]: Parser<T[K]> },
    options: {
        ignoreUnknown?: boolean;
        maxFileMemory?: number;
        tempDir?: string;
    },
    path?: string
): Promise<T> {
    return new Promise(async (resolve, reject) => {
        const [busboy, start] = await parseFormData(stream, {
            limits: {
                fileSize: Infinity
            }
        });

        const fields: Record<string, any> = {};
        const errors: Array<Error> = [];

        busboy.on('field', (fieldname: string, value: string) => {
            if (fieldname in fields && Array.isArray(fields[fieldname])) fields[fieldname].push(value);
            else if (fieldname in fields) fields[fieldname] = [fields[fieldname], value];
            else fields[fieldname] = value;
        });

        busboy.on('file', (fieldname: string, fileStream: NodeJS.ReadableStream, info: Busboy.FileInfo) => {
            const {filename} = info;

            let file: File = new RAMFile(info);

            fileStream.on('data', (chunk: Buffer) => {
                console.log(file.size / 1024 / 1024 / 1024, file instanceof TempFile ? file.getPath() : null);
                file.appendSync(chunk);
                if (file.size > (options?.maxFileMemory ?? 1024 * 1024) && file instanceof RAMFile) {
                    let path = Path.join(options.tempDir ?? os.tmpdir(), encodeURIComponent(`${cryptoRandomString({length: 20, type: "url-safe"})}-${filename}`));
                    file.saveSync(path);
                    file = new TempFile(path, file.size, info);
                }
            });

            fileStream.on('end', () => {
                if (fieldname in fields && Array.isArray(fields[fieldname])) fields[fieldname].push(file);
                else if (fieldname in fields) fields[fieldname] = [fields[fieldname], file];
                else fields[fieldname] = file;
            });

            fileStream.on('error', (err: Error) => {
                // errors.push(new ParsingError(`failed to read file [${path}.${fieldname}]: ${err.message}`));
                errors.push(err);
            });
        });

        busboy.on('error', (err: Error) => {
            reject(err);
        });

        busboy.on('finish', () => {
            if (errors.length > 0) {
                reject(errors);
                return;
            }

            try {
                resolve(object(shape, options)(fields, path));
            } catch (error) {
                reject(error);
            }
        });

        start();
    });
}

export const object = <T extends Record<string, unknown>>(
    shape: { [K in keyof T]: Parser<T[K]> },
    options: {
        ignoreUnknown?: boolean;
        maxFileMemory?: number;
        tempDir?: string;
    } = { ignoreUnknown: true }
) => createParser((value, path): T => {
    if (typeof value === 'object' && value !== null && !(value instanceof Buffer)) {
        const result: Partial<T> = {};
        const entries = Object.entries(value);
        let errors: Array<ParsingError> = [];

        for (const [key, val] of entries) {
            if (key in shape) {
                const parser = shape[key as keyof T];
                try {
                    result[key as keyof T] = parser(val, `${path ?? ""}.${key}`);
                }
                catch (error) {
                    if (error instanceof ParsingError) errors.push(error);
                }
            } else if (!options.ignoreUnknown) {
                throw new ParsingError(`[${path ?? ""}.${key}] is not allowed`);
            }
        }

        for (const key in shape) {
            if (!(key in value)) {
                if (Object.prototype.hasOwnProperty.call(shape, key)) {
                    try {
                        result[key as keyof T] = shape[key as keyof T](undefined, `${path ?? ""}.${key}`);
                    } catch (error) {
                        errors.push(new ParsingError(`[${path ?? ""}.${key}] is required`));
                    }
                }
            }
        }

        if (errors.length > 0) {
            throw new ParsingError(errors.map(error => error.message).join('\n'));
        }
        return result as T;
    }

    try {
        return object(shape, options)(JSON.parse(string()(value, path)), path);
    } catch (e) {}

    throw new ParsingError(`[${path}] cannot be converted to an object`);
}, parser => async (stream, path): Promise<T> => {
    try {
        return await parseFormDataStream(stream, shape, options, path);
    } catch (error) {
        if (error instanceof ParsingError) throw error;
        return parser(await streamToBuffer(stream), path);
    }
});

export const array = <T>(
    parser: Parser<T>,
    options: { min?: number; max?: number } = {}
) => createParser((value, path): Array<T> => {
    if (!Array.isArray(value)) {
        try {
            return array(parser, options)([value], path);
        }
        catch (error) {
            throw new ParsingError(`[${path}] should be an array}`);
        }
    }

    if (options.min !== undefined && value.length < options.min) {
        throw new ParsingError(`[length(${path})] is less than the allowed minimum (${options.min})`);
    }

    if (options.max !== undefined && value.length > options.max) {
        throw new ParsingError(`[length(${path})] is larger than the allowed maximum (${options.max})`);
    }

    let ret: Array<T> = [];
    let errors: Array<ParsingError> = [];
    value.forEach((item, index) => {
        try {
            ret.push(parser(item, `${path}[${index}]`));
        }
        catch (error) {
            if (error instanceof ParsingError) errors.push(error);
        }
    });

    if (errors.length > 0) {
        try {
            return array(parser, options)([value], path);
        }
        catch (error) {
            throw new ParsingError(errors.map(error => error.message).join('\n'));
        }
    }
    return ret;
})

// export const array = <T>(parser: Parser<T>, options: { min?: number; max?: number } = {}): Parser<T[]> =>
//     (value, path) => {
//         if (!Array.isArray(value)) {
//             throw new ParsingError(`[${path}] should be an array`);
//         }
//
//         if (options.min !== undefined && value.length < options.min) {
//             throw new ParsingError(`[length(${path})] is less than the allowed minimum (${options.min})`);
//         }
//
//         if (options.max !== undefined && value.length > options.max) {
//             throw new ParsingError(`[length(${path})] is larger than the allowed maximum (${options.max})`);
//         }
//
//         return value.map((item, index) => parser(item, `${path}[${index}]`));
//     };
//
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