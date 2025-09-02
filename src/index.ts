import * as os from 'os';
import * as fs from 'fs';
import * as Path from 'path';
import * as Busboy from 'busboy';

export class ParsingError extends Error {
    name = 'ParsingError';

    constructor(message: string) {
        super(message);
        Object.setPrototypeOf(this, ParsingError.prototype);
    }
}

export type RawParser<T> = (value: unknown, path?: string) => T;
export type StreamParser<T> = (value: ReadableStream, path?: string) => Promise<T>;
export type Parser<T> = RawParser<T> & {stream: StreamParser<T>};

export function createParser<T>(parser: RawParser<T>, streamParser?: (parser: RawParser<T>) => StreamParser<T>): Parser<T> {
    if (!streamParser) return createParser(parser, parser_ => async (stream: ReadableStream, path?: string): Promise<T> => parser_(Buffer.from(await stream.bytes())));
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

// export type Parser<T> = (value: unknown, path: string) => T;
// export type AsyncParser<T> = (value: unknown, path: string) => Promise<T>;
//
// const isStream = (obj: any): obj is NodeJS.ReadableStream =>
//     obj !== null &&
//     typeof obj === 'object' &&
//     typeof obj.pipe === 'function';
//
// export const buffer = (): Parser<Buffer> => (value, path) => {
//     try {
//         // @ts-ignore
//         return Buffer.from(value);
//     }
//     catch (error) {
//         if (typeof value === 'number') {
//             return Buffer.from(value.toString());
//         }
//     }
//     throw new ParsingError(`[${path}] cannot be parsed as Buffer`);
// };
//
// export const string = (options: { min?: number; max?: number; pattern?: RegExp } = {}): Parser<string> =>
//     (value, path) => {
//         let strValue: string;
//
//         if (typeof value === 'string') {
//             strValue = value;
//         }
//         else if (typeof value === 'number') {
//             strValue = value.toString();
//         }
//         else {
//             try {
//                 strValue = buffer()(value, path).toString();
//             }
//             catch (error) {
//                 throw new ParsingError(`[${path}] cannot be parsed as string`);
//             }
//         }
//
//         if (options.min !== undefined && strValue.length < options.min) {
//             throw new ParsingError(`[length(${path})] is less than the allowed minimum (${options.min})`);
//         }
//         if (options.max !== undefined && strValue.length > options.max) {
//             throw new ParsingError(`[length(${path})] is larger than the allowed maximum (${options.max})`);
//         }
//         if (options.pattern && !options.pattern.test(strValue)) {
//             throw new ParsingError(`[${path}] doesn't match the pattern`);
//         }
//
//         return strValue;
//     };
//
// export const int = (options: { min?: number; max?: number } = {}): Parser<number> =>
//     (value, path) => {
//         let numValue: number;
//
//         if (typeof value === 'number') {
//             numValue = value;
//         }
//         else if (typeof value === 'string') {
//             numValue = parseInt(value);
//             if (isNaN(numValue)) {
//                 throw new ParsingError(`[${path}] cannot be parsed as integer`);
//             }
//         }
//         else {
//             try {
//                 numValue = parseInt(string()(value, path));
//             }
//             catch (error) {
//                 throw new ParsingError(`[${path}] cannot be parsed as integer`);
//             }
//         }
//
//         if (!Number.isInteger(numValue) || Number.isNaN(numValue)) {
//             throw new ParsingError(`[${path}] should be an integer`);
//         }
//
//         if (options.min !== undefined && numValue < options.min) {
//             throw new ParsingError(`[${path}] is less than the allowed minimum (${options.min})`);
//         }
//         if (options.max !== undefined && numValue > options.max) {
//             throw new ParsingError(`[${path}] is larger than the allowed maximum (${options.max})`);
//         }
//
//         return numValue;
//     };
//
// export const float = (options: { min?: number; max?: number } = {}): Parser<number> =>
//     (value, path) => {
//         let numValue: number;
//
//         if (typeof value === 'number') {
//             numValue = value;
//         }
//         else if (typeof value === 'string') {
//             numValue = parseFloat(value);
//             if (isNaN(numValue)) {
//                 throw new ParsingError(`[${path}] cannot be parsed as float`);
//             }
//         }
//         else {
//             try {
//                 numValue = parseFloat(string()(value, path));
//             }
//             catch (error) {
//                 throw new ParsingError(`[${path}] cannot be parsed as float`);
//             }
//         }
//
//         if (!isFinite(numValue)) {
//             throw new ParsingError(`[${path}] should be a finite number`);
//         }
//
//         if (options.min !== undefined && numValue < options.min) {
//             throw new ParsingError(`[${path}] is less than the allowed minimum (${options.min})`);
//         }
//         if (options.max !== undefined && numValue > options.max) {
//             throw new ParsingError(`[${path}] is larger than the allowed maximum (${options.max})`);
//         }
//
//         return numValue;
//     };
//
// export const boolean = (): Parser<boolean> => (value, path) => {
//     if (typeof value === 'boolean') {
//         return value;
//     } else if (typeof value === 'string') {
//         const lowerValue = value.toLowerCase();
//         if (lowerValue === 'true' || lowerValue === '1' || lowerValue === 'yes') {
//             return true;
//         } else if (lowerValue === 'false' || lowerValue === '0' || lowerValue === 'no') {
//             return false;
//         }
//     } else if (typeof value === 'number') {
//         if (value === 1) return true;
//         if (value === 0) return false;
//     }
//
//     throw new ParsingError(`[${path}] cannot be converted to boolean`);
// };
//
// export const objectSync = <T extends Record<string, unknown>>(
//     shape: { [K in keyof T]: Parser<T[K]> },
//     options: { ignoreUnknown?: boolean } = { ignoreUnknown: true }
// ): Parser<T> => {
//     return (value, path) => {
//         if (typeof value === 'object' && value !== null && !(value instanceof Buffer)) {
//             const result: any = {};
//             const entries = Object.entries(value);
//
//             for (const [key, val] of entries) {
//                 if (key in shape) {
//                     const parser = shape[key as keyof T];
//                     result[key] = parser(val, `${path}.${key}`);
//                 } else if (!options.ignoreUnknown) {
//                     throw new ParsingError(`[${path}.${key}] is not allowed`);
//                 }
//             }
//
//             for (const key in shape) {
//                 if (!(key in value) && shape[key].name !== 'optional') {
//                     throw new ParsingError(`[${path}.${key}] is required`);
//                 }
//             }
//
//             return result;
//         }
//
//         if (typeof value === 'string' || Buffer.isBuffer(value)) {
//             let jsonData;
//             try {
//                 jsonData = JSON.parse(value.toString());
//             } catch (e) {
//                 throw new ParsingError(`[${path}] не может быть распаршен как JSON`);
//             }
//             return objectSync(shape, options)(jsonData, path);
//         }
//
//         throw new ParsingError(`[${path}] не может быть обработан как объект`);
//     };
// };
//
// export const object = <T extends Record<string, unknown>>(
//     shape: { [K in keyof T]: Parser<T[K]> },
//     options: { ignoreUnknown?: boolean } = { ignoreUnknown: true }
// ): AsyncParser<T> => {
//     return async (value, path) => {
//         if (isStream(value)) {
//             return (async () => {
//                 try {
//                     return await parseFormDataStream(value, shape, options, path);
//                 }
//                 catch (formDataError) {
//                     return new Promise((resolve, reject) => {
//                         let data = '';
//                         value.on('data', chunk => {
//                             data += chunk;
//                         });
//
//                         value.on('end', () => {
//                             try {
//                                 const jsonData = JSON.parse(data);
//                                 resolve(object(shape, options)(jsonData, path));
//                             } catch (jsonError) {
//                                 reject(new ParsingError(
//                                     `[${path}] не удалось обработать как FormData или JSON: ${(formDataError as Error).message}\n\n${(jsonError as Error).message}`
//                                 ));
//                             }
//                         });
//
//                         value.on('error', reject);
//                     });
//                 }
//             })();
//         }
//
//         return objectSync(shape, options)(value, path);
//     };
// };
//
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
//
// export const file = (
//     options: {
//         maxSizeForMemory?: number;
//         tempDir?: string
//     } = {}
// ): Parser<string | Buffer> => {
//     const maxSizeForMemory = options.maxSizeForMemory ?? 256 * 1024 * 1024; // 256MB по умолчанию
//     const tempDir = options.tempDir ?? os.tmpdir();
//
//     return (value, path) => {
//         if (value && typeof value === 'object' && 'filepath' in value) {
//             const fileObj = value as {
//                 filepath: string;
//                 size: number;
//                 originalname: string;
//                 mimetype: string
//             };
//
//             if (fileObj.size > maxSizeForMemory) {
//                 return fileObj.filepath;
//             } else {
//                 return fs.readFileSync(fileObj.filepath);
//             }
//         }
//
//         if (typeof value === 'string' && value.startsWith('data:')) {
//             const base64Data = value.split(',')[1];
//             if (!base64Data) {
//                 throw new ParsingError(`[${path}] недопустимый формат base64`);
//             }
//
//             const buffer = Buffer.from(base64Data, 'base64');
//
//             if (buffer.length > maxSizeForMemory) {
//                 const tempPath = Path.join(tempDir, `upload-${Date.now()}`);
//                 fs.writeFileSync(tempPath, buffer);
//                 return tempPath;
//             }
//             return buffer;
//         }
//
//         throw new ParsingError(`[${path}] не является допустимым файлом или base64 строкой`);
//     };
// };
//
// const parseFormDataStream = async <T extends Record<string, unknown>>(
//     stream: NodeJS.ReadableStream,
//     shape: { [K in keyof T]: Parser<T[K]> },
//     options: {
//         ignoreUnknown?: boolean;
//         maxSizeForMemory?: number;
//         tempDir?: string;
//     },
//     path: string
// ): Promise<T> => {
//     return new Promise((resolve, reject) => {
//         const busboy = Busboy({
//             headers: (stream as any).headers || {},
//             limits: {
//                 fileSize: Infinity
//             }
//         });
//
//         const fields: Record<string, any> = {};
//         const files: Record<string, any> = {};
//         const errors: Error[] = [];
//         const maxSizeForMemory = options.maxSizeForMemory ?? 256 * 1024 * 1024;
//         const tempDir = options.tempDir ?? os.tmpdir();
//
//         busboy.on('field', (fieldname: string, value: string) => {
//             fields[fieldname] = value;
//         });
//
//         busboy.on('file', (fieldname: string, file: NodeJS.ReadableStream, info: { filename: string; mimeType: string }) => {
//             const { filename, mimeType } = info;
//             let size = 0;
//             let isLargeFile = false;
//             let tempFilePath: string | null = null;
//             let writeStream: fs.WriteStream | null = null;
//
//             file.on('data', (data: Buffer) => {
//                 size += data.length;
//                 if (size > maxSizeForMemory && !isLargeFile) {
//                     isLargeFile = true;
//                     tempFilePath = Path.join(tempDir, `upload-${Date.now()}-${filename}`);
//                     writeStream = fs.createWriteStream(tempFilePath);
//                 }
//
//                 if (isLargeFile && writeStream) {
//                     writeStream.write(data);
//                 }
//             });
//
//             file.on('end', () => {
//                 if (isLargeFile && writeStream && tempFilePath) {
//                     writeStream.end();
//                     files[fieldname] = {
//                         filepath: tempFilePath,
//                         size,
//                         originalname: filename,
//                         mimetype: mimeType
//                     };
//                 } else {
//                     const buffer = Buffer.alloc(size);
//                     files[fieldname] = {
//                         filepath: Path.join(tempDir, `temp-${Date.now()}-${filename}`),
//                         buffer,
//                         size,
//                         originalname: filename,
//                         mimetype: mimeType
//                     };
//                 }
//             });
//
//             file.on('error', (err: Error) => {
//                 errors.push(new ParsingError(`[${path}.${fieldname}] ошибка при обработке файла: ${err.message}`));
//             });
//         });
//
//         busboy.on('error', (err: Error) => {
//             reject(new ParsingError(`[${path}] ошибка парсинга FormData: ${err.message}`));
//         });
//
//         busboy.on('finish', () => {
//             if (errors.length > 0) {
//                 reject(errors[0]);
//                 return;
//             }
//
//             try {
//                 const allData = { ...fields, ...files };
//                 const result: any = {};
//
//                 for (const key in shape) {
//                     if (key in allData) {
//                         result[key] = shape[key](allData[key], `${path}.${key}`);
//                     } else if (shape[key].name !== 'optional') {
//                         throw new ParsingError(`[${path}.${key}] is required`);
//                     }
//                 }
//
//                 if (!options.ignoreUnknown) {
//                     const knownKeys = Object.keys(shape);
//                     for (const key of Object.keys(allData)) {
//                         if (!knownKeys.includes(key)) {
//                             throw new ParsingError(`[${path}.${key}] is not allowed`);
//                         }
//                     }
//                 }
//
//                 resolve(result as T);
//             } catch (err) {
//                 reject(err);
//             }
//         });
//
//         stream.pipe(busboy);
//     });
// };