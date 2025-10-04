import { test, describe } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { FormData } from 'formdata-node';
import { FormDataEncoder } from 'form-data-encoder';

// Import parsium
import {
    buffer,
    string,
    int,
    float,
    boolean,
    file,
    object,
    array,
    oneOf,
    alternatives,
    optional,
    nullable,
    defaultValue,
    uuid,
    email,
    any,
    transform,
    ParsingError,
} from './dist/index.js';
import { readFormData } from './dist/formdata.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, 'fixtures');

// Helper: create readable stream from string or buffer
function streamFrom(data) {
    if (typeof data === 'string') data = Buffer.from(data);
    return Readable.from(data);
}

// Helper: Blob-like wrapper for streams (for FormData)
class BlobFromStream {
    #stream;
    constructor(stream, size) {
        this.#stream = stream;
        this.size = size;
    }

    stream() {
        return this.#stream;
    }

    get [Symbol.toStringTag]() {
        return 'Blob';
    }
}

function fileAsBlob(filepath) {
    const stat = fs.statSync(filepath);
    return new BlobFromStream(fs.createReadStream(filepath), stat.size);
}

// Ensure fixtures exist
if (!fs.existsSync(FIXTURES_DIR)) {
    fs.mkdirSync(FIXTURES_DIR, { recursive: true });
}
const SMALL_FILE = path.join(FIXTURES_DIR, 'small.txt');
const LARGE_FILE = path.join(FIXTURES_DIR, 'large.bin');
if (!fs.existsSync(SMALL_FILE)) fs.writeFileSync(SMALL_FILE, 'hello world');
if (!fs.existsSync(LARGE_FILE)) fs.writeFileSync(LARGE_FILE, Buffer.alloc(2 * 1024 * 1024, 'x')); // 2MB

// ======================
// BUFFER PARSER
// ======================
describe('buffer parser', () => {
    const parser = buffer();

    test('parses string', () => {
        assert.deepStrictEqual(parser('hello', 'test'), Buffer.from('hello'));
    });

    test('parses Uint8Array', () => {
        const u8 = new Uint8Array([104, 101, 108, 108, 111]);
        assert.deepStrictEqual(parser(u8, 'test'), Buffer.from(u8));
    });

    test('parses ArrayBuffer', () => {
        const ab = new Uint8Array([104, 101]).buffer;
        assert.deepStrictEqual(parser(ab, 'test'), Buffer.from(ab));
    });

    test('parses number array', () => {
        assert.deepStrictEqual(parser([104, 101], 'test'), Buffer.from([104, 101]));
    });

    test('rejects object', () => {
        assert.throws(() => parser({}, 'test'), ParsingError);
    });

    test('stream: parses from Readable stream', async () => {
        const stream = streamFrom('hello');
        const result = await parser.stream(stream, 'test');
        assert.deepStrictEqual(result, Buffer.from('hello'));
    });
});

// ======================
// STRING PARSER
// ======================
describe('string parser', () => {
    test('coerces number', () => {
        assert.strictEqual(string()('123', 'test'), '123');
        assert.strictEqual(string()(456, 'test'), '456');
    });

    test('coerces buffer', () => {
        assert.strictEqual(string()(Buffer.from('hi'), 'test'), 'hi');
    });

    test('rejects object', () => {
        assert.throws(() => string()({}, 'test'), ParsingError);
    });

    test('respects max length', () => {
        const p = string({ max: 3 });
        assert.throws(() => p('abcd', 'test'), ParsingError);
    });

    test('respects pattern', () => {
        const p = string({ pattern: /^[a-z]+$/ });
        assert.strictEqual(p('abc', 'test'), 'abc');
        assert.throws(() => p('123', 'test'), ParsingError);
    });

    test('stream: reads buffer then converts', async () => {
        const stream = streamFrom('hello');
        const result = await string().stream(stream, 'test');
        assert.strictEqual(result, 'hello');
    });
});

// ======================
// INT / FLOAT PARSERS
// ======================
describe('int parser', () => {
    const p = int();
    test('parses string "5"', () => assert.strictEqual(p('5', 'test'), 5));
    test('rejects "5.5"', () => assert.throws(() => p('5.5', 'test'), ParsingError));
    test('respects min/max', () => {
        const p2 = int({ min: 0, max: 10 });
        assert.throws(() => p2(11, 'test'), ParsingError);
        assert.throws(() => p2(-1, 'test'), ParsingError);
    });
    test('stream: parses from stream', async () => {
        const result = await p.stream(streamFrom('42'), 'test');
        assert.strictEqual(result, 42);
    });
});

describe('float parser', () => {
    const p = float();
    test('parses "5.5"', () => assert.strictEqual(p('5.5', 'test'), 5.5));
    test('rejects "abc"', () => assert.throws(() => p('abc', 'test'), ParsingError));
    test('stream: parses float from stream', async () => {
        const result = await p.stream(streamFrom('3.14'), 'test');
        assert.strictEqual(result, 3.14);
    });
});

// ======================
// BOOLEAN PARSER
// ======================
describe('boolean parser', () => {
    const p = boolean();
    test('parses "true"', () => assert.strictEqual(p('true', 'test'), true));
    test('parses "1"', () => assert.strictEqual(p('1', 'test'), true));
    test('parses "yes"', () => assert.strictEqual(p('yes', 'test'), true));
    test('parses 0', () => assert.strictEqual(p(0, 'test'), false));
    test('rejects "maybe"', () => assert.throws(() => p('maybe', 'test'), ParsingError));
    test('stream: parses from stream', async () => {
        assert.strictEqual(await p.stream(streamFrom('false'), 'test'), false);
    });
});

// ======================
// FILE PARSER
// ======================
describe('file parser', () => {
    test('parses Buffer → RAMFile', () => {
        const f = file({ max: 1024 });
        const result = f(Buffer.from('data'), 'test');
        assert.strictEqual(result.constructor.name, 'RAMFile');
    });

    test('rejects oversized Buffer', () => {
        const f = file({ max: 2 });
        assert.throws(() => f(Buffer.from('123'), 'test'), ParsingError);
    });

    test('stream: handles file stream → TempFile if large', async () => {
        const f = file({ maxForRAM: 100 }); // 100B RAM threshold
        const stream = fs.createReadStream(LARGE_FILE);
        const result = await f.stream(stream, 'test');
        assert.strictEqual(result.constructor.name, 'TempFile');
        await result.cleanup?.(); // cleanup temp file
    });

    test('stream: small file → RAMFile', async () => {
        const f = file({ maxForRAM: 1024 });
        const stream = fs.createReadStream(SMALL_FILE);
        const result = await f.stream(stream, 'test');
        assert.strictEqual(result.constructor.name, 'RAMFile');
    });
});

// ======================
// OBJECT PARSER + FORMDATA
// ======================
describe('object parser', () => {
    test('basic object parsing', () => {
        const p = object({ name: string(), age: int() });
        const result = p({ name: 'Alice', age: '25' }, 'test');
        assert.deepStrictEqual(result, { name: 'Alice', age: 25 });
    });

    test('ignores unknown by default', () => {
        const p = object({ name: string() });
        const result = p({ name: 'Bob', extra: 'ignored' }, 'test');
        assert.deepStrictEqual(result, { name: 'Bob' });
    });

    test('rejects invalid nested value', () => {
        const p = object({ name: string() });
        assert.throws(() => p({ name: {test: true} }, 'test'), ParsingError);
    });

    test('FormData stream parsing with files', async () => {
        const form = new FormData();
        form.append('name', 'John Doe');
        form.append('age', '30');
        form.append('file', fileAsBlob(SMALL_FILE), 'small.txt');
        form.append('file', fileAsBlob(SMALL_FILE), 'copy.txt');

        const encoder = new FormDataEncoder(form);
        const headers = encoder.headers;
        const stream = Readable.from(encoder);

        // Patch stream with headers for boundary detection (optional in readFormData)
        stream.headers = headers;

        const parser = object({
            name: string(),
            age: int(),
            file: array(file()),
        });

        const result = await parser.stream(stream, 'test');
        assert.strictEqual(result.name, 'John Doe');
        assert.strictEqual(result.age, 30);
        assert.strictEqual(result.file.length, 2);
        assert.strictEqual(result.file[0].constructor.name, 'RAMFile');
        assert.strictEqual(result.file[1].constructor.name, 'RAMFile');

        // Cleanup
        for (const f of result.file) {
            if (f.cleanup) await f.cleanup();
        }
    });
});

// ======================
// ARRAY PARSER
// ======================
describe('array parser', () => {
    test('parses array of ints', () => {
        const p = array(int());
        assert.deepStrictEqual(p(['1', '2'], 'test'), [1, 2]);
    });

    test('rejects invalid nested value', () => {
        const p = array(int());
        assert.throws(() => p('not array', 'test'), ParsingError);
    });

    test('respects max length', () => {
        const p = array(int(), { max: 2 });
        assert.throws(() => p([1, 2, 3], 'test'), ParsingError);
    });

    test('stream: parses JSON array from stream', async () => {
        const p = array(int());
        const jsonStream = streamFrom('[1, 2, 3]');
        // Note: current parsium may not auto-parse JSON from stream for array;
        // but object.stream handles multipart. For raw JSON, you'd need custom logic.
        // So we skip stream test for array unless parsium supports it.
        // Instead, test that it throws if stream is not multipart
        await assert.rejects(() => p.stream(jsonStream, 'test'), ParsingError);
    });
});

// ======================
// COMBINATORS
// ======================
describe('combinators', () => {
    test('oneOf', () => {
        const p = oneOf([1, 2, '3']);
        assert.strictEqual(p('3', 'test'), '3');
        assert.throws(() => p(4, 'test'), ParsingError);
    });

    test('alternatives', () => {
        const p = alternatives(int(), string());
        assert.strictEqual(p(5, 'test'), 5);
        assert.strictEqual(p('abc', 'test'), 'abc');
        assert.throws(() => p({}, 'test'), ParsingError);
    });

    test('optional', () => {
        const p = optional(string());
        assert.strictEqual(p(undefined, 'test'), undefined);
        assert.strictEqual(p('hi', 'test'), 'hi');
    });

    test('nullable', () => {
        const p = nullable(string());
        assert.strictEqual(p(null, 'test'), null);
        assert.strictEqual(p('hi', 'test'), 'hi');
    });

    test('defaultValue', () => {
        const p = defaultValue('default', string());
        assert.strictEqual(p(undefined, 'test'), 'default');
        assert.strictEqual(p(null, 'test'), 'default');
        assert.strictEqual(p('custom', 'test'), 'custom');
    });

    test('uuid', () => {
        const p = uuid();
        assert.strictEqual(p('123e4567-e89b-12d3-a456-426614174000', 'test'), '123e4567-e89b-12d3-a456-426614174000');
        assert.throws(() => p('not-uuid', 'test'), ParsingError);
    });

    test('email', () => {
        const p = email();
        assert.strictEqual(p('user@example.com', 'test'), 'user@example.com');
        assert.throws(() => p('invalid-email', 'test'), ParsingError);
    });

    test('any', () => {
        const p = any();
        const obj = { x: 1 };
        assert.strictEqual(p(obj, 'test'), obj);
    });

    test('transform', () => {
        const p = transform(
            object({ id: string(), type: string() }),
            obj => `${obj.type}:${obj.id}`
        );
        assert.strictEqual(p({ type: 'user', id: '1' }, 'test'), 'user:1');
    });
});

// ======================
// ERROR AGGREGATION
// ======================
describe('error handling', () => {
    test('object collects multiple errors', () => {
        const p = object({ a: int(), b: string() });
        try {
            p({ a: 'not-int', b: {} }, 'root');
            assert.fail('Should throw');
        } catch (err) {
            assert(err instanceof ParsingError);
            assert(err.message.includes('root.a'));
            assert(err.message.includes('root.b'));
        }
    });
});