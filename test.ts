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

async function parse(stream: NodeJS.ReadableStream) {
    const [busboy, start] = await parseFormData(stream);

    busboy.on("field", (name, value) => {
        console.log(`Field: ${name}: ${value}`);
    });
    busboy.on("file", (name, fileStream, {filename}) => {
        console.log(`File: ${name} (${filename})`);
        let stream = fs.createWriteStream(`./test/${filename}`);
        fileStream.pipe(stream);
    });

    start();
}

(async () => {
    const form = new FormData();
    form.append('name', 'John Doe');
    form.append('age', '30');
    form.append('file', fileAsBlob("/home/sizoff/2025-05-25 10-02-22.mkv"), "2025-05-25 10-02-22.mkv");

    let stream = Readable.from(new FormDataEncoder(form));

    await parse(stream);

    // let body = Buffer.alloc(0);
    //
    // stream.on('data', chunk => {
    //     body = Buffer.concat([body, Buffer.from(chunk)]);
    // });
    //
    // stream.on('end', async () => {
    //     console.log('Form data as string:');
    //     console.log(body.toString());
    //     await parse(Readable.from(body));
    // });
})();