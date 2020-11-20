const fse = require('fs-extra');
const fs = require('fs');
const path = require('path');
const cliProgress = require('cli-progress');

const _filePath = path.join(process.cwd(), 'test/test.wpress');

const headerSize = 4377; // length of the header
const headerChunkEOF = Buffer.alloc(headerSize); // Empty header used for check if we reached the end

function readFromBuffer(buffer, start, end) {
  const _buffer = buffer.slice(start, end);
  // Trim off the empty bytes
  return _buffer.slice(0, _buffer.indexOf(0x00)).toString();
}

async function readHeader(fd) {
  const headerChunk = Buffer.alloc(headerSize);
  await fd.read(headerChunk, 0, headerSize, null);

  // Reached end of file
  if (Buffer.compare(headerChunk, headerChunkEOF) === 0) {
    return null;
  }

  const name = readFromBuffer(headerChunk, 0, 255);
  const size = parseInt(readFromBuffer(headerChunk, 255, 269), 10);
  const mTime = readFromBuffer(headerChunk, 269, 281);
  const prefix = readFromBuffer(headerChunk, 281, headerSize);

  return {
    name,
    size,
    mTime,
    prefix,
  };
}

async function readBlock(fd, header, outputPath) {
  const outputFilePath = path.join(outputPath, header.prefix, header.name);
  fse.ensureDirSync(path.dirname(outputFilePath));
  const outputStream = fs.createWriteStream(outputFilePath);

  let totalBytesToRead = header.size;
  while (true) {
    let bytesToRead = 512;
    if (bytesToRead > totalBytesToRead) {
      bytesToRead = totalBytesToRead;
    }

    if (bytesToRead === 0) {
      break;
    }

    const buffer = Buffer.alloc(bytesToRead);
    const data = await fd.read(buffer, 0, bytesToRead, null);
    outputStream.write(buffer);

    totalBytesToRead -= data.bytesRead;
  }

  outputStream.close();
}

async function main(filePath) {
  const extension = path.extname(filePath);
  const outputDir = path.basename(filePath, extension);
  const outputPath = path.join(path.dirname(filePath), outputDir);

  // Ensure the output dir exists and is empty
  fse.emptyDirSync(outputPath);
  const inputFile = await fs.promises.open(filePath, 'r');
  const inputFileStat = fs.statSync(filePath);

  console.log(`Extracting content to ${outputDir}/ ...`);
  console.log();
  const progressBar = new cliProgress.SingleBar(
    {
      format: 'Progress: {bar} | {percentage}%',
    },
    cliProgress.Presets.shades_classic
  );

  progressBar.start(inputFileStat.size, 0);

  let offset = 0;

  while (true) {
    const header = await readHeader(inputFile);
    if (!header) {
      break;
    }

    await readBlock(inputFile, header, outputPath);
    offset = offset + headerSize + header.size;
    progressBar.update(offset);
  }

  await inputFile.close();

  // 100%
  progressBar.update(inputFileStat.size);
  progressBar.stop();
  console.log();
  console.log('Extraction successful!');
}

main(_filePath);
