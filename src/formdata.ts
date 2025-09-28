import Busboy from 'busboy';

/**
 * Parses a multipart/form-data stream without requiring the Content-Type header.
 * Extracts the boundary from the stream assuming it starts with the boundary delimiter.
 * Uses busboy for parsing once the boundary is extracted.
 *
 * @param stream - The Node.js Readable stream containing the multipart/form-data body.
 * @returns Busboy instance and a start function which will pipe stream to busboy
 */
export function parseFormData(stream: NodeJS.ReadableStream): Promise<[Busboy.Busboy, () => void]> {
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

                        resolve([busboy, () => {
                            // Write the buffered data to busboy
                            busboy.write(searchBuffer);
                            // Resume and pipe the remaining stream
                            stream.resume();
                            stream.pipe(busboy);
                        }]);

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