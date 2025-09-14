// import {int, objectSync, string} from "./src/index.js";
//
// console.log(objectSync({
//     test: int()
// })(Buffer.from('{"test": "0"}'), ""));
// console.log(int()(Buffer.from("0"), ""));

// import {buffer} from "./src/index.js";
//
// console.log(buffer()({}));

import {int, object} from "./src/index.js";
import FormData from "form-data";

let formdata = new FormData();

formdata.append("test", "1");

(async () => {
    console.log(await object({test: int()}).stream(formdata));
})();