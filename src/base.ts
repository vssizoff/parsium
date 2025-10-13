import Busboy from "busboy";
import fs from "fs";
import {Readable} from "node:stream";

export interface File extends Partial<Busboy.FileInfo> {
    size: number;

    append(buffer: Buffer): Promise<void>;
    read(): Promise<Buffer>;
    save(path: string): Promise<void>;

    appendSync(buffer: Buffer): void;
    readSync(): Buffer;
    saveSync(path: string): void;

    createReadStream(): NodeJS.ReadableStream;
}

export class RAMFile implements File {
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

export class TempFile implements File {
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
        stream.on('data', (chunk: Buffer | string) => {
            data = Buffer.concat([data, Buffer.from(chunk)])
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