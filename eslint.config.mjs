import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactPlugin from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.wrangler/**",
      "**/coverage/**",
      "**/.vite/**",
      // Planning-run scratch space (SDD ledgers, briefs, review packages).
      // Git-ignored and not project source.
      "**/.superpowers/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["apps/web/**/*.{ts,tsx}", "apps/web/src/**/*.{ts,tsx}"],
    plugins: {
      react: reactPlugin,
      "react-hooks": reactHooks,
    },
    languageOptions: {
      globals: { ...globals.browser },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    settings: { react: { version: "detect" } },
    rules: {
      "react/jsx-uses-react": "off",
      "react/react-in-jsx-scope": "off",
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
  {
    files: ["apps/api/**/*.ts", "packages/**/*.ts", "scripts/**/*.ts"],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/consistent-type-imports": "warn",
      "no-console": ["warn", { allow: ["warn", "error", "info"] }],
    },
  },
  {
    // Operator-facing CLI scripts log freely — console.log is fine here.
    files: ["scripts/**/*.ts"],
    rules: { "no-console": "off" },
  },
  {
    // Design-system guard: raw hex color literals are only allowed in tokens.css.
    plugins: {
      "mark-matrix": {
        rules: {
          "no-raw-hex": {
            meta: {
              type: "problem",
              docs: { description: "Disallow raw hex color literals outside tokens.css" },
              schema: [],
              messages: { rawHex: "Raw hex literals are only allowed in apps/web/src/styles/tokens.css" },
            },
            create(context) {
              const filename = context.filename.replace(/\\/g, "/");
              return {
                Literal(node) {
                  if (typeof node.value !== "string") return;
                  if (!/^#[0-9a-fA-F]{3,8}$/.test(node.value)) return;
                  if (filename.endsWith("apps/web/src/styles/tokens.css") || filename.endsWith("tokens.ts")) return;
                  context.report({ node, messageId: "rawHex" });
                },
              };
            },
          },
        },
      },
    },
    rules: { "mark-matrix/no-raw-hex": "error" },
  },
);
