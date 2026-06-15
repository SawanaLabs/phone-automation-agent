import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const VERSION_CODE_ASSIGNMENT = /versionCode customerAndroidVersionCode/;
const RELEASE_SIGNING_CONFIG =
  /buildTypes\s*\{[\s\S]*release\s*\{[\s\S]*signingConfig signingConfigs\.release/;
const DEBUG_SIGNING_CONFIG =
  /buildTypes\s*\{[\s\S]*release\s*\{[\s\S]*signingConfig signingConfigs\.debug/;

describe("Android release signing contract", () => {
  it("signs official Alpha APK releases with the project release keystore", async () => {
    const buildGradle = await readFile(
      new URL("../android/app/build.gradle", import.meta.url),
      "utf8"
    );

    expect(buildGradle).toContain("release {");
    expect(buildGradle).toContain("CUSTOMER_ANDROID_RELEASE_STORE_FILE");
    expect(buildGradle).toContain("CUSTOMER_ANDROID_RELEASE_STORE_PASSWORD");
    expect(buildGradle).toContain("CUSTOMER_ANDROID_RELEASE_KEY_ALIAS");
    expect(buildGradle).toContain("CUSTOMER_ANDROID_RELEASE_KEY_PASSWORD");
    expect(buildGradle).toContain("CUSTOMER_ANDROID_VERSION_CODE");
    expect(buildGradle).toContain("GradleException");
    expect(buildGradle).toMatch(VERSION_CODE_ASSIGNMENT);
    expect(buildGradle).toMatch(RELEASE_SIGNING_CONFIG);
    expect(buildGradle).not.toMatch(DEBUG_SIGNING_CONFIG);
  });

  it("keeps release keystore material out of source control", async () => {
    const gitignore = await readFile(
      new URL("../android/.gitignore", import.meta.url),
      "utf8"
    );

    expect(gitignore).toContain("*.jks");
    expect(gitignore).toContain("*.keystore");
    expect(gitignore).toContain("keystore.properties");
  });

  it("pins the Android release build to the AGP-compatible Gradle runtime", async () => {
    const wrapperProperties = await readFile(
      new URL(
        "../android/gradle/wrapper/gradle-wrapper.properties",
        import.meta.url
      ),
      "utf8"
    );

    expect(wrapperProperties).toContain("gradle-8.13-bin.zip");
  });

  it("documents safe Alpha release signing configuration", async () => {
    const readme = await readFile(
      new URL("../README.md", import.meta.url),
      "utf8"
    );

    expect(readme).toContain("CUSTOMER_ANDROID_RELEASE_STORE_FILE");
    expect(readme).toContain("CUSTOMER_ANDROID_RELEASE_STORE_PASSWORD");
    expect(readme).toContain("CUSTOMER_ANDROID_RELEASE_KEY_ALIAS");
    expect(readme).toContain("CUSTOMER_ANDROID_RELEASE_KEY_PASSWORD");
    expect(readme).toContain("CUSTOMER_ANDROID_VERSION_CODE");
    expect(readme).toContain("monotonically increasing");
    expect(readme).toContain("JDK 17");
    expect(readme).toContain("Gradle 8.13");
    expect(readme).toContain(
      "$HOME/.phone-automation-agent/customer-android-release"
    );
    expect(readme).toContain("customer-phone-agent-<version>-alpha.<n>.apk");
    expect(readme).toContain("SHA256SUMS");
    expect(readme).toContain("RELEASE_NOTES.md");
    expect(readme).toContain("Never commit");
    expect(readme).toContain("Source-built APKs are developer builds");
  });
});
