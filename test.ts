// import {int, objectSync, string} from "./src/index.js";
//
// console.log(objectSync({
//     test: int()
// })(Buffer.from('{"test": "0"}'), ""));
// console.log(int()(Buffer.from("0"), ""));

import {buffer} from "./src/index.js";

console.log(buffer()({}));