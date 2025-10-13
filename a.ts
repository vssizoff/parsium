import {array, int, optional, string, object} from "./src/index.js";
import * as util from "node:util";
import {Readable} from "node:stream";

// console.log(util.inspect(optional(string())([])));
(async () => {
    console.log(await object({test: string()}).stream(Readable.from("{\"test\": \"test\"}")));
})();