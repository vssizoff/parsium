import {FormData, File} from "formdata-node";
// import {Readable} from "stream"
import {FormDataEncoder} from "form-data-encoder";
// import * as util from "node:util";
//
// interface ParsedHeader {
//     name: string | null;
//     filename: string | null;
//     contentType: string | null;
//     transferEncoding: string | null;
// }
//
// function parseHeader(headerString: string): ParsedHeader {
//     const lines = headerString.split(/\r?\n/);
//     const headers: Record<string, string> = {};
//
//     for (const line of lines) {
//         const colonIndex = line.indexOf(':');
//         if (colonIndex === -1) continue;
//
//         const key = line.substring(0, colonIndex).trim();
//         const value = line.substring(colonIndex + 1).trim();
//         headers[key] = value;
//     }
//
//     const result: ParsedHeader = {
//         name: null,
//         filename: null,
//         contentType: headers['Content-Type'] || null,
//         transferEncoding: headers['Content-Transfer-Encoding']?.trim() || null
//     };
//
//     const disposition = headers['Content-Disposition'];
//     if (disposition) {
//         const params: Record<string, string> = {};
//         const parts = disposition.split(';');
//
//         for (const part of parts) {
//             const trimmed = part.trim();
//             const eqIndex = trimmed.indexOf('=');
//             if (eqIndex === -1) continue;
//
//             const key = trimmed.substring(0, eqIndex).trim();
//             let value = trimmed.substring(eqIndex + 1).trim();
//
//             if (value.startsWith('"') && value.endsWith('"')) {
//                 value = value.substring(1, value.length - 1);
//             }
//
//             params[key] = value;
//         }
//
//         result.name = params['name'] || null;
//
//         if (params['filename*']) {
//             try {
//                 const filenameStar = params['filename*'];
//                 const starParts = filenameStar.split("'");
//                 if (starParts.length >= 3) {
//                     const charset = starParts[0];
//                     const encodedValue = starParts.slice(2).join("'");
//
//                     const decoded = decodeURIComponent(encodedValue);
//
//                     result.filename = decoded;
//                 } else {
//                     result.filename = filenameStar;
//                 }
//             } catch (e) {
//                 result.filename = params['filename*'];
//             }
//         } else if (params['filename']) {
//             result.filename = params['filename'];
//         }
//     }
//
//     return result;
// }
//
// // const result = parseHeader(`Content-Disposition: form-data; name="avatar"; filename*=UTF-8''%D0%BF%D1%80%D0%B8%D0%B2%D0%B5%D1%82.txt\nContent-Type: image/jpeg\nContent-Transfer-Encoding: base64`);
// // console.log(result);
//
// function getBoundary(stream: NodeJS.ReadableStream) {
//     stream.on("data", (chunk: Uint8Array) => {
//         console.log(util.inspect(Buffer.from(chunk).toString()));
//     });
// }
//
// function parseStream(stream: NodeJS.ReadableStream) {
//     console.log(getBoundary(stream));
// }

// import { Transform, Readable } from 'stream';
import * as fs from "node:fs";
//
// interface FormDataField {
//     name: string;
//     filename?: string;
//     type?: string;
// }
//
// type FieldCallback = (field: FormDataField, stream: NodeJS.ReadableStream) => void;
//
// function parseMultipartFromStream(
//     stream: NodeJS.ReadableStream,
//     onField: FieldCallback
// ): Promise<void> {
//     return new Promise((resolve, reject) => {
//         let buffer = Buffer.alloc(0);
//         let boundary: string | null = null;
//         let isHeadersParsed = false;
//         let isFinished = false;
//
//         const findBoundary = (): string | null => {
//             const str = buffer.toString('utf8');
//             const match = str.match(/^--([^\r\n]+)/);
//             return match ? match[1] ?? null : null;
//         };
//
//         const pushBuffer = (chunk: Buffer) => {
//             buffer = Buffer.concat([buffer, chunk]);
//         };
//
//         const processHeaders = (headerText: string): FormDataField | null => {
//             let name: string | undefined;
//             let filename: string | undefined;
//             let type: string | undefined;
//
//             const lines = headerText.split('\r\n');
//             for (const line of lines) {
//                 const [key, ...valueParts] = line.split(': ');
//                 const value = valueParts.join(': ').trim();
//                 const lowerKey = (key ?? "").trim().toLowerCase();
//
//                 if (lowerKey === 'content-disposition') {
//                     const disposition = value;
//                     const nameMatch = disposition.match(/name="([^"]+)"/);
//                     if (nameMatch) name = nameMatch[1];
//
//                     const filenameMatch = disposition.match(/filename="([^"]+)"/);
//                     if (filenameMatch) filename = filenameMatch[1];
//                 } else if (lowerKey === 'content-type') {
//                     type = value;
//                 }
//             }
//
//             return name ? { name, filename, type } : null;
//         };
//
//         const emitField = (field: FormDataField, dataStart: number, dataEnd: number) => {
//             let currentPos = dataStart;
//
//             const dataStream = new Readable({
//                 read() {
//                     if (currentPos < dataEnd) {
//                         const chunkSize = Math.min(64 * 1024, dataEnd - currentPos);
//                         const chunk = buffer.subarray(currentPos, currentPos + chunkSize);
//                         currentPos += chunk.length;
//                         this.push(chunk);
//                     } else {
//                         this.push(null); // end stream
//                     }
//                 },
//             });
//
//             onField(field, dataStream);
//         };
//
//         const processBuffer = () => {
//             if (!boundary) {
//                 boundary = findBoundary();
//                 if (boundary) {
//                     const boundaryStart = `--${boundary}`;
//                     const boundaryBuf = Buffer.from(boundaryStart);
//                     buffer = buffer.subarray(boundaryBuf.length + 2); // skip \r\n after boundary
//                 } else {
//                     return; // not enough data to find boundary
//                 }
//             }
//
//             const boundaryBuf = Buffer.from(`\r\n--${boundary}`);
//
//             while (true) {
//                 const boundaryIndex = buffer.indexOf(boundaryBuf);
//                 if (boundaryIndex === -1) break;
//
//                 const part = buffer.subarray(0, boundaryIndex);
//                 buffer = buffer.subarray(boundaryIndex + boundaryBuf.length);
//
//                 // Check for end marker
//                 const isClosing = buffer.length >= 2 && buffer[0] === 0x2d && buffer[1] === 0x2d;
//                 if (isClosing) {
//                     buffer = buffer.subarray(2);
//                     isFinished = true;
//                 }
//
//                 // Skip \r\n before headers only if not closing
//                 if (!isClosing && buffer.length > 0 && buffer[0] === 0x0d && buffer[1] === 0x0a) {
//                     buffer = buffer.subarray(2);
//                 }
//
//                 // Find headers end
//                 const headerEnd = part.indexOf('\r\n\r\n');
//                 if (headerEnd === -1) continue;
//
//                 const headerText = part.subarray(0, headerEnd).toString();
//                 const bodyStart = headerEnd + 4;
//                 const field = processHeaders(headerText);
//
//                 if (field) {
//                     emitField(field, bodyStart, part.length); // Removed -2
//                 }
//
//                 // Break after emitting if closing
//                 if (isClosing) break;
//             }
//         };
//
//         stream.on('data', (chunk: Buffer) => {
//             pushBuffer(chunk);
//             if (!isHeadersParsed && buffer.length > 100) { // enough to find boundary
//                 processBuffer();
//                 isHeadersParsed = true;
//             } else if (isHeadersParsed) {
//                 processBuffer();
//             }
//         });
//
//         stream.on('end', () => {
//             if (buffer.length > 0) processBuffer();
//             if (!isFinished) isFinished = true;
//             resolve();
//         });
//
//         stream.on('error', reject);
//     });
// }

import { Readable } from 'node:stream';
import Busboy from 'busboy';

/**
 * Parses a multipart/form-data stream without requiring the Content-Type header.
 * Extracts the boundary from the stream assuming it starts with the boundary delimiter.
 * Uses busboy for parsing once the boundary is extracted.
 *
 * @param stream - The Node.js Readable stream containing the multipart/form-data body.
 * @returns A promise resolving to the parsed fields and files.
 */
export function parseFormData(stream: NodeJS.ReadableStream): Promise<Busboy.Busboy> {
    return new Promise((resolve, reject) => {
        const buffers: Buffer[] = [];
        let totalLength = 0;
        let boundary: string | undefined;
        let flag = false;

        const MAX_BUFFER_SIZE = 1024; // Limit buffering to prevent excessive memory use

        const onReadable = () => {
            let chunk: Buffer | null;
            while (true) {
                let readChunk = stream.read();
                if (readChunk === null) break;
                else chunk = Buffer.from(readChunk);
                buffers.push(chunk);
                totalLength += chunk.length;

                if (flag) {
                    reject(new Error('Boundary not found within reasonable buffer size'));
                    return;
                }
                if (totalLength > MAX_BUFFER_SIZE) {
                    flag = true;
                }

                const searchBuffer = Buffer.concat(buffers);
                const crlfIndex = searchBuffer.indexOf('\r\n');

                if (crlfIndex !== -1) {
                    const firstLine = searchBuffer.subarray(0, crlfIndex).toString('utf-8');
                    if (firstLine.startsWith('--')) {
                        boundary = firstLine.slice(2);
                        stream.removeListener('readable', onReadable);
                        stream.removeListener('error', reject);

                        // Create busboy with extracted boundary
                        const headers = { 'content-type': `multipart/form-data; boundary=${boundary}` };
                        const busboy = Busboy({ headers });

                        // const fields: Record<string, string> = {};
                        // const files: Record<string, { filename: string; contentType: string; encoding: string; data: Buffer }> = {};
                        //
                        // busboy.on('field', (name, value, info) => {
                        //     fields[name] = value;
                        // });
                        //
                        // busboy.on('file', (name, file, info) => {
                        //     const fileChunks: Buffer[] = [];
                        //     file.on('data', (data: Buffer) => {
                        //         fileChunks.push(data);
                        //     });
                        //     file.on('end', () => {
                        //         files[name] = {
                        //             filename: info.filename,
                        //             contentType: info.mimeType,
                        //             encoding: info.encoding,
                        //             data: Buffer.concat(fileChunks),
                        //         };
                        //     });
                        // });
                        //
                        // busboy.on('finish', () => {
                        //     resolve({ fields, files });
                        // });
                        //
                        // busboy.on('error', reject);

                        // Write the buffered data to busboy
                        busboy.write(searchBuffer);

                        // Resume and pipe the remaining stream
                        stream.resume();
                        stream.pipe(busboy);

                        resolve(busboy);
                        return;
                    } else {
                        reject(new Error('Invalid multipart/form-data: does not start with boundary'));
                        return;
                    }
                }
            }
        };

        stream.on('readable', onReadable);
        stream.on('error', reject);

        // Kickstart reading if data is already available
        onReadable();
    });
}