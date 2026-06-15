import { describe, expect, it } from "vitest";

import { normalizeWorkerUrl } from "./worker-api";

describe("normalizeWorkerUrl", () => {
  it("keeps explicit http and removes trailing slashes", () => {
    expect(normalizeWorkerUrl(" http://192.168.1.10:8765/// ")).toBe(
      "http://192.168.1.10:8765"
    );
  });

  it("adds http when the user enters a host and port", () => {
    expect(normalizeWorkerUrl("192.168.1.10:8765")).toBe(
      "http://192.168.1.10:8765"
    );
  });

  it("throws early when the worker URL is empty", () => {
    expect(() => normalizeWorkerUrl("  ")).toThrow("Worker URL is required.");
  });
});
