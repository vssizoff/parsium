// import {int, objectSync, string} from "./src/index.js";
//
// console.log(objectSync({
//     test: int()
// })(Buffer.from('{"test": "0"}'), ""));
// console.log(int()(Buffer.from("0"), ""));

// import {buffer} from "./src/index.js";
//
// console.log(buffer()({}));

// import {int, object} from "./src/index.js";
// import FormData from "form-data";
//
// let formdata = new FormData();
//
// formdata.append("test", "1");
//
// (async () => {
//     console.log(await object({test: int()}).stream(formdata));
// })();

// import {Writable, Readable, Transform} from "stream";
//
// function test(stream: NodeJS.ReadableStream) {
//
// }
//
// // let stream = new Writable({
// //     write(chunk, encoding, callback) {
// //         callback();
// //     }
// // });
// let stream = new Transform({
//     transform(chunk, encoding, callback) {
//         this.push(chunk);
//         callback();
//     }
// });
//
// setInterval(() => {
//     stream.write('hello world!');
// }, 1000);
//
// stream.on("data", (chunk) => {
//     console.log(chunk);
// });

import fs from "node:fs";
import {FormData} from "formdata-node";
import {Readable} from "node:stream";
import {FormDataEncoder} from "form-data-encoder";
import {parseFormData} from "./src/formdata.js";

class BlobFromStream {
    #stream;
    constructor(stream: NodeJS.ReadableStream, public size: number) {
        this.#stream = stream;
    }
    stream() {
        return this.#stream;
    }
    get [Symbol.toStringTag]() {
        return "Blob";
    }
}

function fileAsBlob(path: string) {
    return new BlobFromStream(fs.createReadStream(path), fs.lstatSync(path).size);
}

(async () => {
    const form = new FormData();
    form.append('name', 'John Doe');
    form.append('age', '30');
    form.append('file', fileAsBlob("../bun.lock"), "formdata.ts");

    let stream = Readable.from(new FormDataEncoder(form));

    // parseMultipartFromStream(stream, (field, dataStream) => {
    //     console.log('Field:', field);
    //
    //     if (field.filename) {
    //         console.log('File stream received:', field.filename);
    //     } else {
    //         console.log('Text field stream received:', field.name);
    //         let value = '';
    //         dataStream.on('data', chunk => value += chunk);
    //         dataStream.on('end', () => console.log('Value:', value));
    //     }
    // });

    let body = Buffer.alloc(0);
    stream.on('data', chunk => {
        body = Buffer.concat([body, Buffer.from(chunk)]);
    });

    stream.on('end', async () => {
        console.log('Form data as string:');
        console.log(body.toString());
        // parseMultipartFromStream(Readable.from(body), (field, dataStream) => {
        //     console.log('Field:', field);
        //
        //     if (field.filename) {
        //         console.log('File stream received:', field.filename);
        //     } else {
        //         console.log('Text field stream received:', field.name);
        //         let value = '';
        //         dataStream.on('data', chunk => value += chunk);
        //         dataStream.on('end', () => console.log('Value:', value));
        //     }
        // });
        const busboy = await parseFormData(Readable.from(body));
    });
})();