import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Storage boundary (CLAUDE.md): components go through src/lib modules and
  // use-*.ts hooks, never the database or a backend SDK.
  {
    files: ["src/components/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: ["dexie", "dexie-react-hooks", "@/lib/db", "yjs"],
          patterns: ["firebase", "firebase/*", "@firebase/*"],
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Static assets, not source — pdfjs-dist's worker is copied here as-is.
    "public/**",
  ]),
]);

export default eslintConfig;
