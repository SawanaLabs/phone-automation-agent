import { readFile } from "node:fs/promises"
import { describe, expect, it } from "vitest"

describe("Android release signing contract", () => {
  it("signs official Alpha APK releases with the project release keystore", async () => {
    const buildGradle = await readFile(
      new URL("../android/app/build.gradle", import.meta.url),
      "utf8"
    )

    expect(buildGradle).toContain("release {")
    expect(buildGradle).toContain("CUSTOMER_ANDROID_RELEASE_STORE_FILE")
    expect(buildGradle).toContain("CUSTOMER_ANDROID_RELEASE_STORE_PASSWORD")
    expect(buildGradle).toContain("CUSTOMER_ANDROID_RELEASE_KEY_ALIAS")
    expect(buildGradle).toContain("CUSTOMER_ANDROID_RELEASE_KEY_PASSWORD")
    expect(buildGradle).toMatch(/buildTypes\s*\{[\s\S]*release\s*\{[\s\S]*signingConfig signingConfigs\.release/)
    expect(buildGradle).not.toMatch(/buildTypes\s*\{[\s\S]*release\s*\{[\s\S]*signingConfig signingConfigs\.debug/)
  })

  it("keeps release keystore material out of source control", async () => {
    const gitignore = await readFile(
      new URL("../android/.gitignore", import.meta.url),
      "utf8"
    )

    expect(gitignore).toContain("*.jks")
    expect(gitignore).toContain("*.keystore")
    expect(gitignore).toContain("keystore.properties")
  })

  it("documents safe Alpha release signing configuration", async () => {
    const readme = await readFile(new URL("../README.md", import.meta.url), "utf8")

    expect(readme).toContain("CUSTOMER_ANDROID_RELEASE_STORE_FILE")
    expect(readme).toContain("CUSTOMER_ANDROID_RELEASE_STORE_PASSWORD")
    expect(readme).toContain("CUSTOMER_ANDROID_RELEASE_KEY_ALIAS")
    expect(readme).toContain("CUSTOMER_ANDROID_RELEASE_KEY_PASSWORD")
    expect(readme).toContain("$HOME/.phone-automation-agent/customer-android-release")
    expect(readme).toContain("customer-phone-agent-<version>-alpha.<n>.apk")
    expect(readme).toContain("SHA256SUMS")
    expect(readme).toContain("RELEASE_NOTES.md")
    expect(readme).toContain("Never commit")
    expect(readme).toContain("Source-built APKs are developer builds")
  })
})
