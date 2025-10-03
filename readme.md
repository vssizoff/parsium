# parsium

Light, expressive, and type-safe data parsing in TypeScript.

You DON'T NEED to write your schema twice (for parsing and for TypeScript). Just use parser functions, which return well-typed results. TypeScript is aware of the shape of your data and checks its usages at compile time.

Parsium supports both synchronous parsing of raw values and asynchronous stream parsing, making it ideal for handling inputs like form data, files, and large payloads in Node.js without loading everything into memory.

# Why I need one more data parser?

Because I wanted data parsing that:

- Super light and easy

  The library is small. No bloated core with unnecessary functionality. Each parser is exported separately, so with tree shaking, only the parsers you use will be in your bundle.

- Written with TypeScript in mind

  It always returns typed results.

- Support for transformations

  E.g., convert strings to numbers on the fly during parsing.

- Easy extensible with custom parsers

  A parser is just a function. Adding a new one is as simple as writing a function.

- Built-in support for stream parsing

  Handle Node.js Readable streams efficiently, especially for multipart/form-data, files, and large inputs. Avoid memory issues by processing data in chunks.

This library is an alternative to validation-focused libraries like checkeasy, but with a focus on parsing (including coercion) and stream support for real-world Node.js scenarios like HTTP requests.

# Documentation

- [Parsers](#parsers)
    - [buffer](#buffer)
    - [string](#string)
    - [int](#int)
    - [float](#float)
    - [boolean](#boolean)
    - [file](#file)
    - [object](#object)
    - [array](#array)
    - [oneOf](#oneof)
    - [alternatives](#alternatives)
    - [optional](#optional)
    - [nullable](#nullable)
    - [defaultValue](#defaultvalue)
    - [uuid](#uuid)
    - [email](#email)
    - [any](#any)
    - [transform](#transform)
- [Stream Parsing](#stream-parsing)
- [File Handling](#file-handling)
- [Form Data Parsing](#form-data-parsing)
- [Custom Parsers](#custom-parsers)
- [Error Handling](#error-handling)

# Parsers

Although it's easy to create your own parsers, the library exports several ready-to-use ones. Each parser is a function that returns a `Parser<T>`, which can parse raw values synchronously or streams asynchronously via `.stream()`.

Parsers attempt to coerce values where possible (e.g., string to number) and throw `ParsingError` on failure.

## buffer

Parses a value into a Buffer. Supports strings, ArrayBuffers, TypedArrays, arrays of bytes, and serialized Buffers.

```ts
import { buffer } from 'parsium';

const parser = buffer();
parser('hello', 'myValue'); // returns: Buffer.from('hello')
parser([104, 101, 108, 108, 111], 'myValue'); // returns: Buffer.from([104, 101, 108, 108, 111])
parser({}, 'myValue'); // throws: [myValue] cannot be converted to a Buffer
```

For streams:
```ts
const streamParser = parser.stream;
await streamParser(myReadableStream, 'myValue'); // returns: Buffer (concatenated from stream)
```

## string

Parses a value into a string. Coerces from numbers or Buffers.

Possible options:
- min - minimum length
- max - maximum length
- pattern - RegExp to match

```ts
import { string } from 'parsium';

const parser1 = string();
parser1(123, 'myValue'); // returns: '123'

const parser2 = string();
parser2({}, 'myValue'); // throws: [myValue] cannot be converted to a string

const parser3 = string({ max: 3 });
parser3('aaaa', 'myValue'); // throws: [length(myValue)] is larger than the allowed maximum (3)

const parser4 = string({ pattern: /^[a-z]{3}$/i });
parser4('aaaa', 'myValue'); // throws: [myValue] doesn't match the pattern
```

For streams: Streams are read into Buffers and then converted to strings.

## int

Parses a value into an integer. Coerces from strings or numbers.

Possible options:
- min
- max

```ts
import { int } from 'parsium';

const parser1 = int();
parser1('5', 'myValue'); // returns: 5

const parser2 = int();
parser2('5.5', 'myValue'); // throws: [myValue] should be an integer

const parser3 = int({ min: 0, max: 4 });
parser3(5, 'myValue'); // throws: [myValue] is larger than the allowed maximum (4)
```

For streams: Streams are read into strings and then parsed.

## float

Parses a value into a finite number. Coerces from strings or numbers.

Possible options:
- min
- max

```ts
import { float } from 'parsium';

const parser1 = float();
parser1('5.2', 'myValue'); // returns: 5.2

const parser2 = float();
parser2('abc', 'myValue'); // throws: [myValue] cannot be parsed as float

const parser3 = float({ min: 0, max: 4 });
parser3(5.2, 'myValue'); // throws: [myValue] is larger than the allowed maximum (4)
```

For streams: Similar to int.

## boolean

Parses a value into a boolean. Coerces from numbers (1/0) or strings ('true'/'false', 'yes'/'no', '1'/'0').

```ts
import { boolean } from 'parsium';

const parser1 = boolean();
parser1('true', 'myValue'); // returns: true

const parser2 = boolean();
parser2('maybe', 'myValue'); // throws: [myValue] cannot be converted to boolean
```

For streams: Streams are read into strings and then parsed.

## file

Parses a value into a `File` (either `RAMFile` or `TempFile`). Supports Buffers or existing Files.

Possible options:
- max - maximum size in bytes
- maxForRAM - threshold to switch from RAM to temp file (default: 1MB)
- tempDir - directory for temp files
- filename - optional filename

```ts
import { file } from 'parsium';

const parser = file({ max: 1024 * 1024 });
parser(Buffer.from('data'), 'myFile'); // returns: RAMFile instance
```

For streams: Streams are read chunk-by-chunk, appending to RAMFile or TempFile based on size.
```ts
const streamParser = parser.stream;
await streamParser(myFileStream, 'myFile'); // returns: File instance
```

## object

Parses a value into an object, running parsers on each property based on the shape.

Options:
- ignoreUnknown - ignore extra properties (default: true)
- maxFileMemory - alias for maxForRAM in file parsers
- tempDir - for file parsers

```ts
import { object, int, optional, string } from 'parsium';

const parser = object({
  a: int(),
  b: optional(string({ max: 3 })),
  c: any(),
});
parser({ a: '5', c: 'anystring' }, 'myValue'); // returns: { a: 5, b: undefined, c: 'anystring' }
parser({ a: '5', b: 25, c: 'anystring' }, 'myValue'); // throws: [myValue.b] cannot be converted to a string
parser('not an object', 'myValue'); // throws: [myValue] cannot be converted to an object
```

For streams: Supports parsing multipart/form-data streams directly.
```ts
await parser.stream(myFormDataStream, 'myValue'); // Parses fields and files from stream
```

## array

Parses a value into an array, running the given parser on each element.

Options:
- min - minimum length
- max - maximum length

```ts
import { array, int } from 'parsium';

const parser1 = array(int());
parser1(['1', '2', '3'], 'myValue'); // returns: [1, 2, 3]

const parser2 = array(int());
parser2({ a: 2 }, 'myValue'); // throws: [myValue] should be an array

const parser3 = array(int(), { max: 2 });
parser3([1, 2, 3], 'myValue'); // throws: [length(myValue)] is larger than the allowed maximum (2)
```

For streams: Streams are buffered and parsed as arrays (e.g., from JSON).

## oneOf

Parses a value if it strictly equals one of the allowed values.

```ts
import { oneOf } from 'parsium';

const parser = oneOf([1, 2, '3'] as const);
parser('3', 'myValue'); // returns: '3'
parser(4, 'myValue'); // throws: [myValue] isn't equal to any of the expected values
```

## alternatives

Tries multiple parsers in order until one succeeds.

```ts
import { alternatives, int, string } from 'parsium';

const parser = alternatives(int(), string());
parser(5, 'myValue'); // returns: 5 (from int)
parser('abc', 'myValue'); // returns: 'abc' (from string)
parser({}, 'myValue'); // throws: [myValue] doesn't match any of allowed alternatives: ...
```

## optional

Allows the value to be undefined; otherwise, runs the parser.

```ts
import { optional, string } from 'parsium';

const parser = optional(string());
parser(undefined, 'myValue'); // returns: undefined
parser('abc', 'myValue'); // returns: 'abc'
parser(123, 'myValue'); // throws: [myValue] cannot be converted to a string
```

> Enable TypeScript's `strictNullChecks` for proper type handling of undefined.

## nullable

Allows the value to be null; otherwise, runs the parser.

```ts
import { nullable, string } from 'parsium';

const parser = nullable(string());
parser(null, 'myValue'); // returns: null
parser('abc', 'myValue'); // returns: 'abc'
```

Compose with `optional` for both null and undefined: `optional(nullable(...))`.

> Enable TypeScript's `strictNullChecks` for proper type handling of null.

## defaultValue

If the value is undefined or null, returns the default; otherwise, runs the parser.

```ts
import { defaultValue, string } from 'parsium';

const parser = defaultValue('123', string());
parser(undefined, 'myValue'); // returns: '123'
parser('uuu', 'myValue'); // returns: 'uuu'
parser(null, 'myValue'); // returns: '123'
```

## uuid

Parses a value into a valid UUID string.

```ts
import { uuid } from 'parsium';

const parser = uuid();
parser('123e4567-e89b-12d3-a456-426614174000', 'myValue'); // returns: the UUID string
parser('invalid', 'myValue'); // throws: [myValue] is not a valid UUID
```

## email

Parses a value into a valid email string.

```ts
import { email } from 'parsium';

const parser = email();
parser('user@example.com', 'myValue'); // returns: the email string
parser('invalid', 'myValue'); // throws: [myValue] is not a valid email
```

## any

Bypasses parsing and returns the value as-is.

```ts
import { any } from 'parsium';

const parser = any();
parser(123, 'myValue'); // returns: 123 (no coercion or checks)
```

## transform

Parses with the given parser, then applies a transformation.

```ts
import { transform, object, string } from 'parsium';

const parser = transform(
  object({
    id: string({ min: 1 }),
    type: string({ min: 1 }),
  }),
  obj => `${obj.type}:${obj.id}`
);
parser({ type: 'user', id: '1' }, 'myValue'); // returns: 'user:1'
```

# Stream Parsing

All parsers support stream parsing via the `.stream` method, which returns a Promise<T>. This is crucial for handling large inputs without buffering everything in memory.

For example, with `object`:
- It can parse JSON from a stream or multipart/form-data directly.
- Files are handled as streams, switching to temp files if they exceed RAM thresholds.

Use `streamToBuffer` helper to manually convert streams to Buffers if needed.

# File Handling

Parsium includes `File` interface with implementations:
- `RAMFile`: In-memory file for small data.
- `TempFile`: Disk-based for large files.

Methods: append/read/save (sync/async), createReadStream.

Use with `file` parser for handling uploaded files.

# Form Data Parsing

Use `readFormData` to parse multipart/form-data streams without requiring a Content-Type header. It extracts the boundary automatically.

```ts
import { readFormData } from 'parsium';

const [busboy, start] = await readFormData(myRequestStream, { limits: { fileSize: Infinity } });
// Handle busboy events for fields/files
start(); // Pipe the stream
```

Integrates seamlessly with `object` parser for shaped form data.

# Custom Parsers

A parser is a function created with `createParser`. It takes a raw parser (for values) and optionally a stream parser.

```ts
import { createParser, ParsingError } from 'parsium';

const customParser = createParser((value, path): number => {
  if (typeof value !== 'number') throw new ParsingError(`[${path}] must be a number`);
  return value * 2; // Transformation
}, parser => async (stream, path) => {
  const buf = await streamToBuffer(stream);
  return parser(buf, path);
});
```

For reusable parsers with options:
```ts
export const doubledInt = (options: { min?: number } = {}) => createParser((value, path): number => {
  const num = parseInt(value as string, 10);
  if (isNaN(num)) throw new ParsingError(`[${path}] cannot be parsed as int`);
  if (options.min && num < options.min) throw new ParsingError(`[${path}] too small`);
  return num * 2;
});
```

# Error Handling

On failure, parsers throw `ParsingError`. Catch it for custom handling.

```ts
import { ParsingError, int } from 'parsium';

const parser = int();
try {
  parser('a', 'myValue');
} catch (err) {
  if (err instanceof ParsingError) {
    // Handle error, e.g., err.message includes path
  }
}
```

Errors aggregate for complex shapes like objects/arrays, listing all issues.