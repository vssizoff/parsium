# Parsium

Parsium is a lightweight parsing library for Node.js, designed as an alternative to validation libraries like Joi or Checkit—but with a focus on **parsing data**, including **streaming inputs**. It supports parsing basic types, objects, arrays, files, and `multipart/form-data` streams efficiently, handling large files with in-memory (`RAMFile`) and temporary disk storage (`TempFile`) options. Parsium is ideal for API request parsing, form data handling, and data transformation in server-side applications.

## Key Features

- **Stream Parsing**: Asynchronous parsing of readable streams—perfect for handling large payloads without loading everything into memory.
- **Type-Safe Parsers**: Composable parsers for primitives (`string`, `int`, `float`, etc.), complex structures (`object`, `array`), and utilities (`optional`, `oneOf`, etc.).
- **File Handling**: Built-in support for files with size limits, RAM/disk switching, and Busboy integration for `multipart/form-data`.
- **Error Handling**: Throws `ParsingError` with detailed messages for invalid data.
- **Minimal Dependencies**: Only depends on `busboy` (for form data) and `crypto-random-string` (for temp files).

---

## Installation

```bash
npm install parsium
```

Parsium exports a set of parser functions that can be composed to validate and parse data. Each parser is a function that takes a value (or stream) and returns the parsed result or throws a `ParsingError`.

---

## Basic Parsing

```ts
import { string, int, boolean } from 'parsium';

const name = string({ min: 3, max: 50 })('John Doe'); // 'John Doe'
const age = int({ min: 18 })(25); // 25
const isActive = boolean()(true); // true

try {
  int()('invalid'); // Throws ParsingError
} catch (err) {
  console.error(err.message); // '[undefined] cannot be parsed as integer'
}
```

---

## Object Parsing

Define shapes for objects:

```ts
import { object, string, int } from 'parsium';

const userParser = object({
  name: string(),
  age: int({ min: 18 }),
});

const user = userParser({ name: 'Jane', age: 30 }); // { name: 'Jane', age: 30 }
```

---

## Stream Parsing

Parsers support streaming inputs via the `.stream` method:

```ts
import { createReadStream } from 'fs';
import { buffer } from 'parsium';

const stream = createReadStream('file.txt');
const data = await buffer().stream(stream); // Buffer of file content
```

For form data (`multipart/form-data`):

```ts
import { object, file, string } from 'parsium';
import type { IncomingMessage } from 'http';

// Assuming `req` is an HTTP request stream (e.g., Express Request)
const formParser = object({
  username: string(),
  avatar: file({ max: 1024 * 1024 }), // 1MB max
});

const parsedForm = await formParser.stream(req as IncomingMessage);
```

---

## Array Parsing

```ts
import { array, int } from 'parsium';

const numbers = array(int(), { min: 1, max: 5 })([1, 2, 3]); // [1, 2, 3]
```

---

## Utility Parsers

```ts
import { optional, oneOf, uuid, email, transform } from 'parsium';

const optionalName = optional(string())(); // undefined

const status = oneOf(['active', 'inactive'])('active'); // 'active'

const id = uuid()('123e4567-e89b-12d3-a456-426614174000'); // Valid UUID string

const mail = email()('user@example.com'); // Valid email string

const upperCase = transform(string(), (val: string) => val.toUpperCase())('hello'); // 'HELLO'
```

---

## API Reference

### Base Types and Classes

- `ParsingError`: Custom error thrown on parsing failures.
- `Parser<T>`: Type for parsers. Has a `stream` property for async stream parsing.
- `File`: Interface for file objects.
- `RAMFile`: In-memory file storage.
- `TempFile`: Disk-based temporary file storage.
- `createParser<T>(rawParser, streamParser?)`: Creates a composable parser.
- `streamToBuffer(stream)`: Utility to convert a stream to a `Buffer`.

### Basic Parsers

- `buffer()`: Parses to `Buffer`. Supports strings, `ArrayBuffer`, arrays of bytes, etc.
- `string(options?)`: Parses to string. Options: `{ min?: number; max?: number; pattern?: RegExp }`
- `int(options?)`: Parses to integer. Options: `{ min?: number; max?: number }`
- `float(options?)`: Parses to float. Options: `{ min?: number; max?: number }`
- `boolean()`: Parses to boolean (supports `'true'`, `'1'`, `'yes'`, etc.)

### Object and Array Parsers

- `file(options?)`: Parses to `File` (`RAMFile` or `TempFile`).  
  Options: `{ max?: number; maxForRAM?: number; tempDir?: string; filename?: string }`
- `object<T>(shape, options?)`: Parses to object of type `T`.  
  Options: `{ ignoreUnknown?: boolean; maxFileMemory?: number; tempDir?: string }`  
  Supports `multipart/form-data` streams via Busboy.
- `array<T>(parser, options?)`: Parses to array of `T`.  
  Options: `{ min?: number; max?: number }`

### Utility Parsers

- `oneOf<T>(values: readonly T[])`: Ensures value is one of the provided literals.
- `alternatives(...parsers)`: Tries parsers in order until one succeeds.
- `optional<T>(parser)`: Allows `undefined` or `null`; otherwise applies parser.
- `nullable<T>(parser)`: Allows `null`; otherwise applies parser.
- `defaultValue<T>(defaultVal: T, parser)`: Uses default if value is `undefined`/`null`.
- `uuid()`: Validates and parses UUID string.
- `email()`: Validates and parses email string.
- `any<T>()`: Passes value through without parsing.
- `transform<T, U>(parser: Parser<T>, transformer: (val: T) => U)`: Applies parser then transforms result.

### Form Data Handling

- `readFormData(stream, busboyConfig?, options?)`: Parses `multipart/form-data` streams, extracting boundary automatically if needed.

---

## Examples

### Parsing JSON Body

```ts
import { object, string, int } from 'parsium';

const bodyParser = object({
  title: string({ max: 100 }),
  count: int({ min: 0 }),
});

async function handleRequest(body: string) {
  try {
    return bodyParser(JSON.parse(body));
  } catch (err) {
    // Handle ParsingError
    throw err;
  }
}
```

### Handling File Uploads via Stream

```ts
import { object, file, string } from 'parsium';
import { Readable } from 'stream';

const uploadParser = object({
  description: string(),
  document: file({ max: 5 * 1024 * 1024, tempDir: '/tmp/uploads' }),
});

async function processUpload(stream: Readable) {
  const data = await uploadParser.stream(stream);
  const buffer = await data.document.read(); // Access file content
  return buffer;
}
```

### Composing Parsers

```ts
import { array, object, optional, uuid, transform } from 'parsium';

const itemParser = object({
  id: uuid(),
  name: transform(string(), (s: string) => s.trim()),
});

const listParser = array(optional(itemParser));

const items = listParser([
  { id: '123e4567-e89b-12d3-a456-426614174000', name: ' Item ' },
]);

// Result: [{ id: '123e4567-e89b-12d3-a456-426614174000', name: 'Item' }]
```