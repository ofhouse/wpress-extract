const fse = require('fs-extra');
const fs = require('fs');
const path = require('path');

const HEADER_SIZE = 4377;
const HEADER_CHUNK_EOF = Buffer.alloc(HEADER_SIZE);

function readFromBuffer(buffer, start, end) {
    const _buffer = buffer.slice(start, end);
    return _buffer.slice(0, _buffer.indexOf(0x00)).toString();
}

async function readHeader(fd) {
    const headerChunk = Buffer.alloc(HEADER_SIZE);
    await fd.read(headerChunk, 0, HEADER_SIZE, null);

    if (Buffer.compare(headerChunk, HEADER_CHUNK_EOF) === 0) {
        return null;
    }

    const name = readFromBuffer(headerChunk, 0, 255);
    const size = parseInt(readFromBuffer(headerChunk, 255, 269), 10);
    const mTime = readFromBuffer(headerChunk, 269, 281);
    const prefix = readFromBuffer(headerChunk, 281, HEADER_SIZE);

    return {
        name,
        size,
        mTime,
        prefix
    };
}

async function readBlockToFile(fd, header, outputPath) {
    const outputFilePath = path.join(outputPath, header.prefix, header.name);
    fse.ensureDirSync(path.dirname(outputFilePath));
    const outputStream = fs.createWriteStream(outputFilePath);

    let totalBytesToRead = header.size;
    while (totalBytesToRead > 0) {
        let bytesToRead = Math.min(512, totalBytesToRead);
        const buffer = Buffer.alloc(bytesToRead);
        const { bytesRead } = await fd.read(buffer, 0, bytesToRead, null);
        outputStream.write(buffer.slice(0, bytesRead));
        totalBytesToRead -= bytesRead;
    }

    outputStream.close();
}

async function wpExtract({
    inputFile,
    outputDir,
    onStart,
    onUpdate,
    onFinish,
    override
}) {
    if (!fs.existsSync(inputFile)) {
        throw new Error(`Input file at location "${inputFile}" could not be found.`);
    }

    if (override) {
        fse.emptyDirSync(outputDir);
    } else if (fs.existsSync(outputDir) && !await isDirEmpty(outputDir)) {
        throw new Error(`Output dir is not empty. Clear it first or use the --force option to override it.`);
    }

    const inputFileStat = fs.statSync(inputFile);
    const fd = await fs.promises.open(inputFile, 'r');
    onStart(inputFileStat.size);

    let offset = 0;
    while (true) {
        const header = await readHeader(fd);
        if (!header) break;
        await readBlockToFile(fd, header, outputDir);
        offset += HEADER_SIZE + header.size;
        onUpdate(offset);
    }

    await fd.close();
    onFinish(offset / HEADER_SIZE - 1);  // Assuming every file has a header
}

function createHeaderForFile(file, prefix = '') {
    const header = Buffer.alloc(HEADER_SIZE);
    header.write(file.name, 0, 255);
    header.write(file.size.toString(), 255, 269);
    header.write(Date.now().toString(), 269, 281);
    header.write(prefix, 281, HEADER_SIZE);
    return header;
}

async function wpCompress({ inputDir, outputFile, onStart, onUpdate, onFinish }) {
    const files = fse.readdirSync(inputDir, { withFileTypes: true });
    const output = await fs.promises.open(outputFile, 'w');
    
    let totalSize = files.reduce((sum, file) => sum + file.size, 0);
    onStart(totalSize);
    
    let processedSize = 0;
    for (const file of files) {
        if (file.isFile()) {
            const header = createHeaderForFile(file);
            await output.write(header);
            
            const content = fs.readFileSync(path.join(inputDir, file.name));
            await output.write(content);
            
            processedSize += file.size;
            onUpdate(processedSize);
        } else if (file.isDirectory()) {
            // Recursive directory handling can be complex for progress updates,
            // so it's omitted here for simplicity. You'll need a more complex
            // approach for accurate progress on nested directories.
            await wpCompress({ 
                inputDir: path.join(inputDir, file.name),
                outputFile
            });
        }
    }

    await output.write(HEADER_CHUNK_EOF);
    await output.close();
    onFinish();
}


module.exports = { wpExtract, wpCompress };
