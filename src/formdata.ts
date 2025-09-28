import Busboy from 'busboy';

type FormDataParseOptions = {
    headers: Record<string, string>;
    contentType: string;
    boundary: string;
};

function parseOptions(options: Partial<FormDataParseOptions>): string | null {
    // Try to get boundary from options.boundary first
    if (options.boundary) {
        return options.boundary;
    }

    // Try to extract boundary from contentType
    const contentType = options.contentType || options.headers?.['content-type'] || options.headers?.['Content-Type'];
    if (contentType) {
        const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
        if (boundaryMatch) {
            return (boundaryMatch[1] || boundaryMatch[2]) ?? null;
        }
    }

    // Try to extract boundary from headers directly
    if (options.headers) {
        const contentTypeHeader = options.headers['content-type'] || options.headers['Content-Type'];
        if (contentTypeHeader) {
            const boundaryMatch = contentTypeHeader.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
            if (boundaryMatch) {
                return (boundaryMatch[1] || boundaryMatch[2]) ?? null;
            }
        }
    }

    return null;
}

async function createBusBoy(boundary: string, busboyConfig: Busboy.BusboyConfig = {}, stream: NodeJS.ReadableStream, searchBuffer: Buffer = Buffer.alloc(0)): Promise<[Busboy.Busboy, () => void]> {
    // Create busboy with extracted boundary
    const headers = { 'content-type': `multipart/form-data; boundary=${boundary}` };
    const busboy = Busboy({ ...busboyConfig, headers });

    return [busboy, () => {
        // Write the buffered data to busboy
        busboy.write(searchBuffer);
        // Resume and pipe the remaining stream
        stream.resume();
        stream.pipe(busboy);
    }];
}

/**
 * Parses a multipart/form-data stream without requiring the Content-Type header.
 * Extracts the boundary from the stream assuming it starts with the boundary delimiter.
 * Uses busboy for parsing once the boundary is extracted.
 *
 * @param stream - The Node.js Readable stream containing the multipart/form-data body.
 * @param busboyConfig - config for Busboy
 * @param options - Use it if you probably have a boundary. If parser cannot find boundary in options it will try to extract it from stream
 * @returns Busboy instance and a start function which will pipe stream to busboy
 */
export function parseFormData(stream: NodeJS.ReadableStream, busboyConfig: Busboy.BusboyConfig = {}, options: Partial<FormDataParseOptions> = {}): Promise<[Busboy.Busboy, () => void]> {
    let boundary = parseOptions(options);
    if (boundary) return createBusBoy(boundary, busboyConfig, stream);
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

                        resolve(createBusBoy(boundary, busboyConfig, stream, searchBuffer));

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