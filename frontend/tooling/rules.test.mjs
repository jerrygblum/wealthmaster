import assert from "node:assert/strict";
import test from "node:test";
import { ESLint, Linter } from "eslint";
import architecture from "./architecture.mjs";

// These tests repeatedly lint in-memory replacements for the same file. CI's
// single-run optimization otherwise reads the on-disk file and then loses types.
const eslint = new ESLint({
  overrideConfig: {
    languageOptions: { parserOptions: { disallowAutomaticSingleRunInference: true } },
  },
});
async function messages(code) {
  const [result] = await eslint.lintText(code, { filePath: "src/pages/application/App.tsx" });
  assert.equal(result.fatalErrorCount, 0, JSON.stringify(result.messages));
  return result.messages;
}
test("real configuration rejects conditional hooks", async () => {
  const results = await messages(
    'import {useState} from "react"; export function Broken({enabled}:{enabled:boolean}){if(enabled)useState(0);return null;}',
  );
  assert(results.some((m) => m.ruleId === "react-hooks/rules-of-hooks"));
});
test("real configuration rejects unhandled promises", async () => {
  const results = await messages('Promise.resolve("synthetic");');
  assert(results.some((m) => m.ruleId === "@typescript-eslint/no-floating-promises"));
});
test("real configuration rejects inaccessible images", async () => {
  const results = await messages('export function Broken(){return <img src="/synthetic.png"/>;}');
  assert(results.some((m) => m.ruleId === "jsx-a11y/alt-text"));
});
test("component boundaries reject higher layers and service/controller imports", () => {
  const linter = new Linter();
  const config = {
    files: ["**/*.js"],
    plugins: { architecture },
    rules: { "architecture/layers": "error" },
  };
  for (const target of [
    "../molecules/Field",
    "../../services/api",
    "../../hooks/auth/useLogin",
    "../../pages/auth/LoginPage",
  ]) {
    const results = linter.verify(`import {thing} from "${target}";`, config, {
      filename: "src/components/atoms/Invalid.js",
    });
    assert(
      results.some((m) => m.ruleId === "architecture/layers"),
      target,
    );
  }
  const results = linter.verify('import {thing} from "../atoms/Controls";', config, {
    filename: "src/components/molecules/Allowed.js",
  });
  assert.equal(results.length, 0);
});
