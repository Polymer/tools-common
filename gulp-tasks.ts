/**
 * @license
 * Copyright (c) 2016 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at
 * http://polymer.github.io/LICENSE.txt
 * The complete set of authors may be found at
 * http://polymer.github.io/AUTHORS.txt
 * The complete set of contributors may be found at
 * http://polymer.github.io/CONTRIBUTORS.txt
 * Code distributed by Google as part of the polymer project is also
 * subject to an additional IP rights grant found at
 * http://polymer.github.io/PATENTS.txt
 */

'use strict';

import * as path from 'path';
import * as fs from 'fs-extra';

import gulp = require('gulp');
const mocha = require('gulp-spawn-mocha');
const tslint_lib = require('gulp-tslint');

const runSequence = require('run-sequence');
const run = require('gulp-run');

function task(
    name: string, deps: string[], impl?: (done?: () => void) => void) {
  if (gulp.hasTask(name)) {
    throw new Error(
        `A task with the name ${JSON.stringify(name)} already exists!`);
  }
  gulp.task(name, deps, impl);
}

interface Options {
  stickyDeps: Set<string>;
  tsSrcs: NodeJS.ReadWriteStream;
  jsSrcs: NodeJS.ReadWriteStream;
  dataSrcs: NodeJS.ReadWriteStream;
  buildArtifacts: string[];
}

const defaultOptions: Options = {
  tsSrcs: gulp.src('src/**/*.ts'),
  stickyDeps: new Set(),
  jsSrcs: gulp.src(['test/**/*.js', 'gulpfile.js']),
  dataSrcs: gulp.src(['src/**/*', '!src/**/*.ts']),
  buildArtifacts: ['lib/', 'typings/'],
};
function fillInDefaults(maybeOptions?: Partial<Options>): Options {
  return Object.assign({}, defaultOptions, maybeOptions);
}

module.exports.depcheck = function depcheck(maybeOptions?: Partial<Options>) {
  const options = fillInDefaults(maybeOptions);

  interface DepcheckResults {
    invalidFiles: string[];
    dependencies: string[];
  }

  task('depcheck', [], async() => {
    const depcheck_lib = require('depcheck');
    // Note that process.cwd() in a gulp task is the directory of the
    // running gulpfile. See e.g.
    // https://github.com/gulpjs/gulp/issues/523
    const result = await new Promise<DepcheckResults>(
        (resolve, _reject) =>
            depcheck_lib(process.cwd(), {ignoreDirs: []}, resolve));
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
    for (const dep of unused) {
      if (dep.startsWith('@types/')) {
        unused.delete(dep);
      }
    }
    if (unused.size > 0) {
      console.log('Unused dependencies:', unused);
      throw new Error('Unused dependencies');
    }
  });
};

module.exports.lint = function(maybeOptions?: Partial<Options>) {
  module.exports.tslint(maybeOptions);
  module.exports.eslint(maybeOptions);
  module.exports.depcheck(maybeOptions);
  task('lint', ['tslint', 'eslint', 'depcheck']);
};

module.exports.tslint = function(maybeOptions?: Partial<Options>) {
  const options = fillInDefaults(maybeOptions);
  task(
      'tslint',
      [],
      () => options.tsSrcs.pipe(tslint_lib({formatter: 'verbose'}))
                .pipe(tslint_lib.report()));
};

module.exports.eslint = function(maybeOptions?: Partial<Options>) {
  const eslint_lib = require('gulp-eslint');
  const options = fillInDefaults(maybeOptions);
  task(
      'eslint',
      [],
      () => options.jsSrcs.pipe(eslint_lib())
                .pipe(eslint_lib.format())
                .pipe(eslint_lib.failAfterError()));
};

module.exports.build = function(options: Options) {
  const defaultOptions = {
    tsSrcs: gulp.src('src/**/*.ts'),
    dataSrcs: gulp.src(['src/**/*', '!src/**/*.ts']),
  };
  options = Object.assign({}, defaultOptions, options);

  task('compile', [], () => {
    return run('tsc').exec();
  });
  task('build', ['compile'], () => options.dataSrcs.pipe(gulp.dest('lib')));
};

module.exports.clean = function(maybeOptions?: Partial<Options>) {
  const options = fillInDefaults(maybeOptions);

  task('clean', [], () => {
    for (const buildArtifact of options.buildArtifacts) {
      fs.removeSync(path.join(process.cwd(), buildArtifact));
    }
  });
};


module.exports.buildAll = function(maybeOptions?: Partial<Options>) {
  module.exports.clean(maybeOptions);
  module.exports.lint(maybeOptions);
  module.exports.build(maybeOptions);

  task('build-all', [], (done) => {
    runSequence('clean', 'lint', 'build', done);
  });
};

module.exports.test = function(maybeOptions?: Partial<Options>) {
  module.exports.buildAll(maybeOptions);

  task(
      'test',
      ['build'],
      () => gulp.src('test/**/*_test.js', {read: false}).pipe(mocha({
        ui: 'tdd',
        reporter: 'spec',
      })));
};

module.exports.generateCompleteTaskgraph = function(
    maybeOptions?: Partial<Options>) {
  module.exports.test(maybeOptions);
};
