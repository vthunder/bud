import { describe, expect, test } from "bun:test";
import { getDefaultModel, CURATED_MODELS } from "../../src/integrations/replicate";

describe("replicate integration", () => {
  test("has curated models defined", () => {
    expect(CURATED_MODELS.schnell).toBe("black-forest-labs/flux-schnell");
    expect(CURATED_MODELS.pro).toBe("black-forest-labs/flux-1.1-pro");
    expect(CURATED_MODELS.sdxl).toBe("stability-ai/sdxl");
  });

  test("getDefaultModel returns schnell", () => {
    expect(getDefaultModel()).toBe("black-forest-labs/flux-schnell");
  });
});
