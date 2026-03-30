import Path from "path";
import os from "os";
import cryptoRandomString from "crypto-random-string";
import {type Parser, ParsingError, RAMFile, createParser, TempFile, type File, streamToBuffer} from "./base.js";
import {buffer, string} from "./basic.js";
import {readFormData} from "./formdata.js";
import Busboy from "busboy";

export const file = (
    options?: {
        max?: number,
        maxForRAM?: number,
        tempDir?: string,
        filename?: string
    }
) => createParser((value, path): File => {
    if (value instanceof RAMFile || value instanceof TempFile) {
        if (options?.max && value.size > options?.max) throw new ParsingError(`[${path ?? ""}] is too large.`, [{path, issue: "too large", rejectedValue: value.size}]);
        return value;
    }
    let file = new RAMFile();
    let buf = buffer()(value, path);
    if (options?.max && buf.byteLength > options?.max) throw new ParsingError(`[${path ?? ""}] is too large.`, [{path, issue: "too large", rejectedValue: buf.byteLength}]);
    file.appendSync(buffer()(value, path));
    return file;
}, parser => (stream, path): Promise<File> => {
    return new Promise((resolve, reject) => {
        let file: File = new RAMFile();

        stream.on('data', (chunk: Buffer) => {
            file.appendSync(chunk);
            if (file.size > (options?.maxForRAM ?? 1024 * 1024) && file instanceof RAMFile) {
                let path = Path.join(options?.tempDir ?? os.tmpdir(), encodeURIComponent(cryptoRandomString({length: 20, type: "url-safe"}) + (options?.filename ? `-${options?.filename ?? ""}` : "")));
                file.saveSync(path);
                file = new TempFile(path, file.size);
            }
        });

        stream.on('end', () => {
            resolve(parser(file));
        });

        stream.on('error', (err: Error) => {
            reject(new ParsingError(`failed to read file [${path ?? ""}]: ${err.message}`, [{path, issue: "failed to read file " + err.message, rejectedValue: null}]));
        });
    });
});

async function parseFormDataStream<T extends Record<string, unknown>>(
    stream: NodeJS.ReadableStream,
    shape: { [K in keyof T]: Parser<T[K]> },
    options: {
        ignoreUnknown?: boolean;
        maxForRAM?: number;
        tempDir?: string;
    },
    path?: string
): Promise<T> {
    return new Promise(async (resolve, reject) => {
        const [busboy, start] = await readFormData(stream, {
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
                file.appendSync(chunk);
                if (file.size > (options?.maxForRAM ?? 1024 * 1024) && file instanceof RAMFile) {
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
                errors.push(err);
            });

            // let fileParser = file({maxForRAM: options.maxForRAM, tempDir: options.tempDir, filename: info.filename});
            // fileParser.stream(fileStream, path);
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

function isFormdataStream(stream: NodeJS.ReadableStream): Promise<boolean> {
    return new Promise((resolve) => {
        const wasFlowing = (stream as any).readableFlowing;
        stream.pause();

        let resolved = false;
        const cleanup = () => {
            stream.removeListener('readable', handleReadable);
            stream.removeListener('end', handleEnd);
        };

        const restoreFlowingState = () => {
            if (wasFlowing === true) {
                stream.resume();
            }
        };

        const handleReadable = () => {
            if (resolved) return;
            const chunk = stream.read();

            if (chunk === null) {
                handleEnd();
                return;
            }

            stream.unshift(chunk);
            resolved = true;
            cleanup();
            restoreFlowingState();
            resolve(!chunk.toString().startsWith('{'));
        };

        const handleEnd = () => {
            if (resolved) return;
            resolved = true;
            cleanup();
            restoreFlowingState();
            resolve(false);
        };

        stream.once('readable', handleReadable);
        stream.once('end', handleEnd);

        process.nextTick(() => {
            if (resolved) return;
            if ((stream as any).readableEnded) {
                handleEnd();
            }
        });
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
                throw new ParsingError(`[${path ?? ""}.${key}] is not allowed`, [{path, issue: "not allowed", rejectedValue: key}]);
            }
        }

        for (const key in shape) {
            if (!(key in value)) {
                if (Object.prototype.hasOwnProperty.call(shape, key)) {
                    try {
                        result[key as keyof T] = shape[key as keyof T](undefined, `${path ?? ""}.${key}`);
                    } catch (error) {
                        errors.push(new ParsingError(`[${path ?? ""}.${key}] is required`, [{path, issue: "required", rejectedValue: key}]));
                    }
                }
            }
        }

        if (errors.length > 0) {
            const fieldErrors: Array<{path: string | undefined, issue: string, rejectedValue: any}> = [];
            errors.forEach(({fields}) => {
                fieldErrors.push(...fields);
            });
            throw new ParsingError(errors.map(error => error.message).join('\n'), fieldErrors);
        }
        return result as T;
    }

    let json = "";
    try {
        json = JSON.parse(string()(value, path)); 
    } catch (e) {
        throw new ParsingError(`[${path}] cannot be converted to an object`, [{path, issue: "cannot be converted to an object", rejectedValue: null}]);
    }

    return object(shape, options)(json, path);
}, parser => async (stream, path): Promise<T> => {
    if (await isFormdataStream(stream)) {
        return await parseFormDataStream(stream, shape, options, path);
    }
    else {
        return parser(await streamToBuffer(stream), path);
    }
});

export const array = <T>(
    parser: Parser<T>,
    options: { min?: number; max?: number } = {}
) => createParser((value, path): Array<T> => {
    if (!Array.isArray(value)) {
        try {
            return [parser(value, `${path}[0]`)];
        }
        catch (error) {
            throw new ParsingError(`[${path ?? ""}] should be an array`, [{path, issue: "should be an array", rejectedValue: null}]);
        }
    }

    if (options.min !== undefined && value.length < options.min) {
        throw new ParsingError(`[length(${path ?? ""})] is less than the allowed minimum (${options.min})`, [{path, issue: `less than the allowed minimum (${options.min})`, rejectedValue: value.length}]);
    }

    if (options.max !== undefined && value.length > options.max) {
        throw new ParsingError(`[length(${path ?? ""})] is larger than the allowed maximum (${options.max})`, [{path, issue: `larger than the allowed maximum (${options.max})`, rejectedValue: value.length}]);
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
            return [parser(value, `${path}[0]`)];
        }
        catch (error) {
            const fieldErrors: Array<{path: string | undefined, issue: string, rejectedValue: any}> = [];
            errors.forEach(({fields}) => {
                fieldErrors.push(...fields);
            });
            throw new ParsingError(errors.map(error => error.message).join('\n'), fieldErrors);
        }
    }
    return ret;
})
