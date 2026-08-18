// Guards against config/*.yaml and src/constants.ts drifting apart.
//
// constants.ts is hand-maintained (see scripts/build-config.js), while the YAML
// claims to be the source of truth for DPI-bypass tuning. When those disagree,
// the YAML looks authoritative and is silently ignored — which is exactly how
// the ASN map ended up missing Iran's largest networks.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import yaml from "js-yaml";
import { ASN_TO_ISP, ISP_FRAGMENTS, FRAGMENT } from "../../tools/smart-sub/src/constants.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const ispTuning = yaml.load(readFileSync(resolve(root, "config/isp-tuning.yaml"), "utf8"));

describe("constants.ts stays in sync with config/isp-tuning.yaml", () => {
  it("ASN_TO_ISP matches asn_to_isp exactly", () => {
    const fromYaml = Object.fromEntries(
      Object.entries(ispTuning.asn_to_isp).map(([k, v]) => [String(k), v])
    );
    expect(ASN_TO_ISP).toEqual(fromYaml);
  });

  it("every mapped ISP either has a fragment profile or falls back cleanly", () => {
    for (const isp of new Set(Object.values(ASN_TO_ISP))) {
      const profile = ISP_FRAGMENTS[isp] ?? FRAGMENT;
      expect(profile, `no usable fragment profile for "${isp}"`).toBeDefined();
      expect(profile.packets).toBeTruthy();
    }
  });

  it("ISP_FRAGMENTS matches isp_fragments", () => {
    const fromYaml = ispTuning.isp_fragments ?? {};
    for (const [isp, cfg] of Object.entries(fromYaml)) {
      expect(ISP_FRAGMENTS[isp], `constants.ts is missing fragment profile "${isp}"`).toBeDefined();
      expect(ISP_FRAGMENTS[isp].packets).toBe(cfg.packets);
    }
  });
});
