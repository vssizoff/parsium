import {array, int, optional, string} from "./src/index.js";
import * as util from "node:util";

console.log(util.inspect(optional(string())([])));