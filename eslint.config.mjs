import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import obsidianmd from "eslint-plugin-obsidianmd";

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    plugins: { obsidianmd },
    rules: {
      ...obsidianmd.configs.recommended,
      // PR review에서 Required로 지적된 항목들
      "@typescript-eslint/require-await": "error",
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-unnecessary-type-assertion": "error",
      "no-restricted-imports": ["error", { paths: ["crypto"] }],
      "no-console": ["error", { allow: ["warn", "error", "debug"] }],
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/restrict-template-expressions": "error",
      "no-control-regex": "error",
      // 불필요한 룰 끄기
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
  {
    ignores: ["main.js", "node_modules/**", "*.config.*", "build.ts"],
  }
);
