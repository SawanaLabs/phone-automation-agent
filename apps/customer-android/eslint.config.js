import { config as reactConfig } from "@workspace/eslint-config/react-internal"

/** @type {import("eslint").Linter.Config} */
export default [
  ...reactConfig,
  {
    ignores: ["node_modules/**", ".expo/**", "dist/**", "web-build/**"],
  },
]
