/* global process */
import { spawn } from "node:child_process"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { describe, expect, it } from "vitest"
import {
  createReleaseArtifacts,
  findApksigner,
  getAlphaReleaseMetadata,
  releaseAlpha,
  releaseApkRelativePath,
} from "./release-alpha.mjs"

function withSigningEnv(overrides = {}) {
  return {
    ...process.env,
    CUSTOMER_ANDROID_RELEASE_STORE_FILE: "/tmp/customer-release.jks",
    CUSTOMER_ANDROID_RELEASE_STORE_PASSWORD: "store-password",
    CUSTOMER_ANDROID_RELEASE_KEY_ALIAS: "customer-alpha",
    CUSTOMER_ANDROID_RELEASE_KEY_PASSWORD: "key-password",
    CUSTOMER_ANDROID_VERSION_CODE: "1",
    ...overrides,
  }
}

function runReleaseAlpha(envOverrides = {}) {
  const cleanEnv = { ...process.env, ...envOverrides }
  for (const key of [
    "CUSTOMER_ANDROID_RELEASE_STORE_FILE",
    "CUSTOMER_ANDROID_RELEASE_STORE_PASSWORD",
    "CUSTOMER_ANDROID_RELEASE_KEY_ALIAS",
    "CUSTOMER_ANDROID_RELEASE_KEY_PASSWORD",
  ]) {
    delete cleanEnv[key]
  }

  return new Promise((resolve) => {
    const child = spawn(process.execPath, ["scripts/release-alpha.mjs"], {
      cwd: new URL("..", import.meta.url),
      env: cleanEnv,
      stdio: ["ignore", "pipe", "pipe"],
    })

    let stdout = ""
    let stderr = ""
    child.stdout.on("data", (chunk) => {
      stdout += chunk
    })
    child.stderr.on("data", (chunk) => {
      stderr += chunk
    })
    child.on("close", (code) => {
      resolve({ code, stdout, stderr })
    })
  })
}

describe("Alpha Sideload APK release", () => {
  it("fails fast when official release signing configuration is missing", async () => {
    const result = await runReleaseAlpha()

    expect(result.code).toBe(1)
    expect(result.stderr).toContain(
      "Official Alpha Sideload APK releases must use a project release keystore."
    )
    expect(result.stderr).toContain("CUSTOMER_ANDROID_RELEASE_STORE_FILE")
    expect(result.stderr).toContain("CUSTOMER_ANDROID_RELEASE_STORE_PASSWORD")
    expect(result.stderr).toContain("CUSTOMER_ANDROID_RELEASE_KEY_ALIAS")
    expect(result.stderr).toContain("CUSTOMER_ANDROID_RELEASE_KEY_PASSWORD")
  })

  it("fails fast when the Android version code is missing", async () => {
    let stderr = ""
    const result = await releaseAlpha({
      env: withSigningEnv({
        CUSTOMER_ANDROID_VERSION_CODE: undefined,
      }),
      stderr: { write: (message) => { stderr += message } },
      stdout: { write: () => {} },
      runCommand: async () => {
        throw new Error("release build should not run without a version code")
      },
    })

    expect(result.exitCode).toBe(1)
    expect(stderr).toContain("CUSTOMER_ANDROID_VERSION_CODE")
    expect(stderr).toContain("monotonically increasing")
  })

  it("creates the APK, checksum, and signing fingerprint release artifacts", async () => {
    const projectRoot = await mkReleaseFixture()
    const sourceApkPath = join(projectRoot, releaseApkRelativePath)
    const apksignerPath = join(projectRoot, "tools/apksigner")
    const commandCalls = []

    try {
      await mkdir(dirname(sourceApkPath), { recursive: true })
      await mkdir(dirname(apksignerPath), { recursive: true })
      await writeFile(
        join(projectRoot, "app.json"),
        JSON.stringify({ expo: { version: "0.1.0" } })
      )
      await writeFile(sourceApkPath, "signed apk bytes")
      await writeFile(apksignerPath, "#!/bin/sh\n")

      const result = await createReleaseArtifacts({
        projectRoot,
        env: withSigningEnv({
          CUSTOMER_ANDROID_APKSIGNER: apksignerPath,
          CUSTOMER_ANDROID_RELEASE_COMMIT: "abc123",
          CUSTOMER_ANDROID_VERSION_CODE: "7",
        }),
        runCommand: async (command, args, options) => {
          commandCalls.push({
            command,
            args,
            cwd: options.cwd,
            versionCode: options.env?.CUSTOMER_ANDROID_VERSION_CODE,
          })
          if (args[0] === "verify") {
            return {
              stdout:
                "Signer #1 certificate SHA-256 digest: aa:bb:cc:dd\n",
              stderr: "",
            }
          }

          return { stdout: "", stderr: "" }
        },
      })

      expect(commandCalls).toEqual([
        {
          command: process.platform === "win32" ? "gradlew.bat" : "./gradlew",
          args: [":app:assembleRelease"],
          cwd: join(projectRoot, "android"),
          versionCode: "7",
        },
        {
          command: apksignerPath,
          args: ["verify", "--print-certs", result.artifactPath],
          cwd: projectRoot,
          versionCode: "7",
        },
      ])
      await expect(readFile(result.artifactPath, "utf8")).resolves.toBe(
        "signed apk bytes"
      )
      expect(result.artifactPath).toMatch(
        /customer-phone-agent-0\.1\.0-alpha\.1\.apk$/
      )
      await expect(readFile(result.checksumPath, "utf8")).resolves.toMatch(
        /^[a-f0-9]{64} {2}customer-phone-agent-0\.1\.0-alpha\.1\.apk\n$/
      )
      await expect(readFile(result.fingerprintPath, "utf8")).resolves.toContain(
        "Certificate SHA-256 fingerprint: AA:BB:CC:DD"
      )
      await expect(readFile(result.releaseNotesPath, "utf8")).resolves.toContain(
        "Customer Phone Agent 0.1.0-alpha.1"
      )
      await expect(readFile(result.releaseNotesPath, "utf8")).resolves.toContain(
        "Commit: `abc123`"
      )
      await expect(readFile(result.releaseNotesPath, "utf8")).resolves.toContain(
        "Required Android Permissions"
      )
      await expect(readFile(result.releaseNotesPath, "utf8")).resolves.toContain(
        "Android version code: `7`"
      )
      expect(result.certificateSha256Fingerprint).toBe("AA:BB:CC:DD")
    } finally {
      await rm(projectRoot, { recursive: true, force: true })
    }
  })

  it("derives the versioned Alpha artifact name from app.json", async () => {
    const projectRoot = await mkReleaseFixture()

    try {
      await writeFile(
        join(projectRoot, "app.json"),
        JSON.stringify({ expo: { version: "0.2.0" } })
      )

      await expect(
        getAlphaReleaseMetadata({
          projectRoot,
          env: { CUSTOMER_ANDROID_ALPHA_NUMBER: "3" },
        })
      ).resolves.toMatchObject({
        displayVersion: "0.2.0-alpha.3",
        artifactName: "customer-phone-agent-0.2.0-alpha.3.apk",
        signingName: "customer-phone-agent-0.2.0-alpha.3.signing.txt",
      })
    } finally {
      await rm(projectRoot, { recursive: true, force: true })
    }
  })

  it("discovers apksigner from android/local.properties", async () => {
    const projectRoot = await mkReleaseFixture()
    const androidDir = join(projectRoot, "android")
    const sdkRoot = join(projectRoot, "sdk")
    const apksignerPath = join(sdkRoot, "build-tools/36.0.0/apksigner")
    const env = { ...process.env }
    delete env.ANDROID_HOME
    delete env.ANDROID_SDK_ROOT
    delete env.CUSTOMER_ANDROID_APKSIGNER
    delete env.APKSIGNER

    try {
      await mkdir(androidDir, { recursive: true })
      await mkdir(dirname(apksignerPath), { recursive: true })
      await writeFile(join(androidDir, "local.properties"), `sdk.dir=${sdkRoot}\n`)
      await writeFile(apksignerPath, "#!/bin/sh\n")

      await expect(
        findApksigner({
          env,
          androidDir,
          homeDir: join(projectRoot, "home"),
        })
      ).resolves.toBe(apksignerPath)
    } finally {
      await rm(projectRoot, { recursive: true, force: true })
    }
  })
})

async function mkReleaseFixture() {
  return mkdtemp(join(tmpdir(), "customer-alpha-"))
}
