#!/usr/bin/env node

const path = require('path');
const yargs = require('yargs');
const { hideBin } = require('yargs/helpers');
const cliProgress = require('cli-progress');

const wpExtract = require('./lib/wpress-extract');

async function main({ inputFile, outputDir, override, ignoreWriteErrors }) {
  const progressBar = new cliProgress.SingleBar(
    {
      format: 'Progress: {bar} | {percentage}%',
    },
    cliProgress.Presets.shades_classic
  );

  const onStart = (totalSize) => {
    console.log(
      `Extracting content to: ${path.relative(process.cwd(), outputDir)}/`
    );

    // Initialize progressbar
    progressBar.start(totalSize, 0);
  };

  const onUpdate = (value) => {
    progressBar.update(value);
  };

  let totalFiles = 0;
  let errorFiles = 0;
  let success = false;
  const onFinish = (counts) => {
    totalFiles = counts.success;
    errorFiles = counts.error;
    success = true;
    // Set the progress bar to 100% and stop
    progressBar.update(progressBar.getTotal());
  };

  try {
    await wpExtract({
      inputFile,
      outputDir,
      onStart,
      onUpdate,
      onFinish,
      override,
      ignoreWriteErrors,
    });
  } catch (error) {
    progressBar.stop();
    console.error('Error: ', error.message);
  } finally {
    progressBar.stop();

    if (success) {
      console.log();
      console.log(`Successfully extracted ${totalFiles} files.`);
      if (errorFiles > 0) {
        console.error(
          `${errorFiles} files were not extracted because of write error`
        );
      }
    }
  }
}

yargs(hideBin(process.argv)).command(
  '$0 <input>',
  'Extract a .wpress archive',
  (_yargs) => {
    _yargs
      .positional('input', {
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
      })
      .option('iwe', {
        alias: 'ignore-write-errors',
        describe: 'Ignore file write errors and continue',
        type: 'boolean',
      });
  },
  (argv) => {
    const override = !!argv.force;
    const inputFile = path.resolve(process.cwd(), argv.input);
    const ignoreWriteErrors = !!argv.ignoreWriteErrors;

    let outputDir =
      typeof argv.out === 'string'
        ? path.resolve(process.cwd(), argv.out)
        : undefined;
    if (!outputDir) {
      // Generate the output dirname from the the input file
      const extension = path.extname(inputFile);
      const dirName = path.basename(inputFile, extension);
      outputDir = path.join(process.cwd(), dirName);
    }

    return main({ inputFile, outputDir, override, ignoreWriteErrors });
  }
).argv;
