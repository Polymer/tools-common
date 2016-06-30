/**
 * @license
 * Copyright (c) 2016 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
 * The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
 * The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
 * Code distributed by Google as part of the polymer project is also
 * subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
 */

'use strict';

const fs = require('fs-extra');
const mergeStream = require('merge-stream');
const mocha = require('gulp-mocha');
const path = require('path');
const runSeqBase = require('run-sequence');
const tslint_lib = require("gulp-tslint");
const typescript = require('gulp-typescript');
const typings = require('gulp-typings');

function task(gulp, name, deps, impl) {
  if (gulp.hasTask(name)) {
    throw new Error(
        `A task with the name ${JSON.stringify(name)} already exists!`);
  }
  gulp.task(name, deps, impl);
}

module.exports.init = function(gulp) {
  task(gulp, 'init', () => gulp.src("./typings.json").pipe(typings()));
}

module.exports.depcheck = function depcheck(gulp, options) {
  const depcheck_lib = require('depcheck');
  const defaultOptions = {stickyDeps: new Set()};
  options = Object.assign({}, defaultOptions, options);

  task(gulp, 'depcheck', () => {
    return new Promise((resolve, reject) => {
      depcheck_lib(process.cwd(), {ignoreDirs: []}, resolve);
    }).then((result) => {
      const invalidFiles = Object.keys(result.invalidFiles) || [];
      const invalidJsFiles = invalidFiles.filter((f) => f.endsWith('.js'));

      if (invalidJsFiles.length > 0) {
        console.log('Invalid files:', result.invalidFiles);
        throw new Error('Invalid files');
      }

      const unused = new Set(result.dependencies);
      for (const falseUnused of options.stickyDeps) {
        unused.delete(falseUnused);
      }
      if (unused.size > 0) {
        console.log('Unused dependencies:', unused);
        throw new Error('Unused dependencies');
      }
    });
  });
}

module.exports.lint = function(gulp, options) {
  module.exports.tslint(gulp, options);
  module.exports.eslint(gulp, options);
  module.exports.depcheck(gulp, options);
  task(gulp, 'lint', ['tslint', 'eslint', 'depcheck']);
}

function getJsonConfig(filename) {
  var placesToLook = [
    process.cwd(),
    __dirname,
  ];
  for (const directory of placesToLook) {
    try {
      return JSON.parse(
          fs.readFileSync(path.join(directory, filename), 'utf-8'));
    } catch (error) { /* don't care */ }
  }
  throw new Error('Could not find a .eslintrc.json. This should never happen.');
}

module.exports.tslint = function(gulp, options) {
  const defaultOptions = {tsSrcs: gulp.src('src/**/*.ts')};
  options = Object.assign({}, defaultOptions, options);
  const tslintConfig = getJsonConfig('tslint.json');
  task(gulp, 'tslint', () =>
      options.tsSrcs
        .pipe(tslint_lib({
          configuration: tslintConfig,
        }))
        .pipe(tslint_lib.report('verbose')));
}

module.exports.eslint = function(gulp, options) {
  const eslint_lib = require('gulp-eslint');
  const defaultOptions = {jsSrcs: gulp.src(['test/**/*.js', 'gulpfile.js'])};
  options = Object.assign({}, defaultOptions, options);
  const eslintConfig = getJsonConfig('.eslintrc.json');
  task(gulp, 'eslint', () =>
      options.jsSrcs
        .pipe(eslint_lib(eslintConfig))
        .pipe(eslint_lib.format())
        .pipe(eslint_lib.failAfterError()));
}

module.exports.build = function(gulp, options) {
  const defaultOptions = {
    tsSrcs: gulp.src('src/**/*.ts'),
    dataSrcs: gulp.src(['src/**/*', '!src/**/*.ts']),
  };
  options = Object.assign({}, defaultOptions, options);

  const tsProject = typescript.createProject('tsconfig.json');

  task(gulp, 'build', () =>
    mergeStream(
      options.tsSrcs.pipe(typescript(tsProject)),
      options.dataSrcs
    ).pipe(gulp.dest('lib'))
  );
}

module.exports.clean = function(gulp, options) {
  const defaultOptions = {buildArtifacts: ['lib/', 'typings/']};
  options = Object.assign({}, defaultOptions, options);

  task(gulp, 'clean', () => {
    for (const buildArtifact of options.buildArtifacts) {
      fs.removeSync(path.join(process.cwd(), buildArtifact));
    }
  });
}


module.exports.buildAll = function(gulp, options) {
  module.exports.clean(gulp, options);
  module.exports.init(gulp, options);
  module.exports.lint(gulp, options);
  module.exports.build(gulp, options);

  task(gulp, 'build-all', (done) => {
    runSeqBase.use(gulp)('clean', 'init', 'lint', 'build', done);
  });
}

module.exports.test = function(gulp, options) {
  module.exports.buildAll(gulp, options);

  task(gulp, 'test', ['build'], () =>
    gulp.src('test/**/*_test.js', {read: false})
        .pipe(mocha({
          ui: 'tdd',
          reporter: 'spec',
        }))
  );
}

// If this gulpfile is being loaded for the tools-common repo itself, rather
// than being used as a library...
if (__dirname === process.cwd()) {
  const gulp = require('gulp');
  module.exports.test(gulp);
}
