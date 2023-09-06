#!/usr/bin/env node

const path = require('path');
const yargs = require('yargs');
const { hideBin } = require('yargs/helpers');
const cliProgress = require('cli-progress');
const { wpExtract, wpCompress } = require('./lib/wpress-handler');

/**
 * Executes a task (either compression or extraction) with progress indication.
 * 
 * @param {Function} task - The task function to be executed (either wpExtract or wpCompress).
 * @param {string} inputPath - The input path (either a directory or a .wpress file).
 * @param {string} outputPath - The output path (either a directory or a .wpress file).
 */
function executeWithProgress(task, inputPath, outputPath) {
    const progressBar = new cliProgress.SingleBar({
        format: 'Progress: {bar} | {percentage}%',
    }, cliProgress.Presets.shades_classic);

    const onStart = (totalSize) => {
        console.log(`Processing content from: ${path.relative(process.cwd(), inputPath)}/`);
        progressBar.start(totalSize, 0);
    };

    const onUpdate = (processedSize) => {
        progressBar.update(processedSize);
    };

    const onFinish = () => {
        progressBar.stop();
        console.log(`Task completed. Output: ${outputPath}`);
    };

    return task({ inputPath, outputPath, onStart, onUpdate, onFinish })
        .catch(error => {
            progressBar.stop();
            console.error('Error:', error.message);
        });
}

yargs(hideBin(process.argv))
    .command(
        'extract <input>',
        'Extract a .wpress archive',
        (_yargs) => {
            _yargs.positional('input', {
                describe: 'Path to the .wpress archive you want to extract',
                type: 'string',
            })
            .option('o', {
                alias: 'out',
                describe: 'Directory where the content should be extracted to',
                type: 'string',
            })
            .option('f', {
                alias: 'force',
                describe: 'Override existing directory',
                type: 'boolean',
            });
        },
        (argv) => {
            const input = path.resolve(process.cwd(), argv.input);
            const output = argv.out 
                ? path.resolve(process.cwd(), argv.out) 
                : path.join(process.cwd(), path.basename(argv.input, '.wpress'));
            executeWithProgress(wpExtract, input, output);
        }
    )
    .command(
        'compress <input> <output>',
        'Compress a directory into a .wpress archive',
        (_yargs) => {
            _yargs.positional('input', {
                describe: 'Directory to be compressed',
                type: 'string',
            })
            .positional('output', {
                describe: 'Path where the .wpress file should be saved',
                type: 'string',
            });
        },
        (argv) => {
            const input = path.resolve(process.cwd(), argv.input);
            const output = path.resolve(process.cwd(), argv.output);
            executeWithProgress(wpCompress, input, output);
        }
    )
    .argv;
