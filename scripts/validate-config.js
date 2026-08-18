#!/usr/bin/env node
// Validate config/*.yaml files against their JSON schemas using AJV
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import yaml from "js-yaml";
import Ajv from "ajv";
import addFormats from "ajv-formats";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

const configs = [
  { yaml: "config/servers.yaml", schema: "config/schemas/servers.schema.json" },
  { yaml: "config/cdn.yaml", schema: "config/schemas/cdn.schema.json" },
  { yaml: "config/isp-tuning.yaml", schema: "config/schemas/isp-tuning.schema.json" },
  { yaml: "config/protocols.yaml", schema: "config/schemas/protocols.schema.json" },
];

let errors = 0;

for (const { yaml: yamlFile, schema: schemaFile } of configs) {
  const data = yaml.load(readFileSync(resolve(root, yamlFile), "utf8"));
  const schema = JSON.parse(readFileSync(resolve(root, schemaFile), "utf8"));
  const validate = ajv.compile(schema);
  const valid = validate(data);

  if (valid) {
    console.log(`✓ ${yamlFile}`);
  } else {
    console.error(`✗ ${yamlFile}`);
    for (const err of validate.errors) {
      console.error(`  ${err.instancePath} ${err.message}`);
    }
    errors++;
  }
}

if (errors > 0) {
  console.error(`\n${errors} config file(s) failed validation`);
  process.exit(1);
} else {
  console.log("\n✓ All config valid");
}
