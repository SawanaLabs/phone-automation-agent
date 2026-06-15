import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("Android manifest contract", () => {
  it("allows HTTP hosted runtime URLs for the customer APK", async () => {
    const manifest = await readFile(
      new URL("../android/app/src/main/AndroidManifest.xml", import.meta.url),
      "utf8"
    );

    expect(manifest).toContain('android:usesCleartextTraffic="true"');
  });
});
