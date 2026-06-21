// Copyright (c) OpenAI. All rights reserved.
"use strict";

const VERSION = "1.2.0";

const text = require("./text.cjs");
const image = require("./image.cjs");
const svg = require("./svg.cjs");
const latex = require("./latex.cjs");
const code = require("./code.cjs");
const layout = require("./layout.cjs");
const layoutBuilders = require("./layout_builders.cjs");
const util = require("./util.cjs");

module.exports = {
  VERSION,
  // text layout
  ...text,
  // images
  ...image,
  // svg helpers
  ...svg,
  // LaTeX -> SVG
  ...latex,
  // code block -> pptx text runs
  ...code,
  // slide layout analyzers
  ...layout,
  // slide layout builders
  ...layoutBuilders,
  // text layout helpers and utilities
  ...util,
};
