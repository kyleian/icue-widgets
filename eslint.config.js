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
    // Widget scripts — also expose iCUE globals injected at runtime
    files: ["widgets/**/*.js"],
    languageOptions: {
      globals: {
        iCUE: "readonly",
        iCUE_initialized: "readonly",
        icueEvents: "writable",
        plugins: "readonly",
      },
    },
  },
  {
    // Node.js globals for companion and scripts
    files: ["companion/**/*.js", "scripts/**/*.js"],
    languageOptions: {
      globals: {
        process: "readonly",
        __dirname: "readonly",
        __filename: "readonly",
        Buffer: "readonly",
        require: "readonly",
        module: "readonly",
        exports: "readonly",
      },
    },
  },
  {
    ignores: ["node_modules/**", "companion/node_modules/**", "dist/**", "*.icuewidget"],
  },
];
