import js from "@eslint/js";

/** @type {import('eslint').Linter.FlatConfig[]} */
export default [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        // Browser globals for widget files
        window: "readonly",
        document: "readonly",
        console: "readonly",
        fetch: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
      },
    },
    rules: {
      "no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "no-console": "off",
      eqeqeq: ["error", "always"],
      "prefer-const": "error",
      "no-var": "error",
    },
  },
  {
    // Widget scripts — iCUE injects globals at runtime; disable no-undef
    // since property names are declared per-widget in the HTML meta tags
    files: ["widgets/**/*.js"],
    languageOptions: {
      globals: {
        iCUE: "readonly",
        iCUE_initialized: "readonly",
        icueEvents: "writable",
        plugins: "readonly",
      },
    },
    rules: {
      // iCUE-injected property globals (e.g. proxyPort, accentColor) are
      // declared in index.html meta tags, not statically knowable here
      "no-undef": "off",
    },
  },
  {
    // Node.js globals for companion (CommonJS — uses require/module.exports)
    files: ["companion/**/*.js"],
    languageOptions: {
      sourceType: "commonjs",
      globals: {
        process: "readonly",
        __dirname: "readonly",
        __filename: "readonly",
        Buffer: "readonly",
        require: "readonly",
        module: "writable",
        exports: "writable",
      },
    },
  },
  {
    // Node.js globals for scripts (ESM — uses import/export)
    files: ["scripts/**/*.js"],
    languageOptions: {
      globals: {
        process: "readonly",
        __dirname: "readonly",
        __filename: "readonly",
        Buffer: "readonly",
      },
    },
  },
  {
    ignores: ["node_modules/**", "companion/node_modules/**", "dist/**", "*.icuewidget"],
  },
];
