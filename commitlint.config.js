// Conventional commit enforcement
// Allowed prefixes: feat, fix, docs, infra, chore, ci, test, refactor, perf, style, revert
export default {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "type-enum": [
      2,
      "always",
      [
        "feat",
        "fix",
        "docs",
        "infra",
        "chore",
        "ci",
        "test",
        "refactor",
        "perf",
        "style",
        "revert",
      ],
    ],
    "subject-case": [0], // Allow any case in subject
    "body-max-line-length": [0], // Allow long lines (URLs, Dependabot bodies)
    "footer-max-line-length": [0],
  },
};
