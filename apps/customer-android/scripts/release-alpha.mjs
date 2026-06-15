#!/usr/bin/env node
/* global process */

import { spawn } from "node:child_process"
import { createHash } from "node:crypto"
import { createReadStream } from "node:fs"
import {
  copyFile,
  mkdir,
  readFile,
  readdir,
  stat,
  writeFile,
} from "node:fs/promises"
import { homedir } from "node:os"
import {
  basename,
  dirname,
  join,
  relative,
  resolve,
  sep,
} from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

export const requiredSigningEnv = [
  "CUSTOMER_ANDROID_RELEASE_STORE_FILE",
  "CUSTOMER_ANDROID_RELEASE_STORE_PASSWORD",
  "CUSTOMER_ANDROID_RELEASE_KEY_ALIAS",
  "CUSTOMER_ANDROID_RELEASE_KEY_PASSWORD",
]

export const alphaReleaseOutputDir = "dist/alpha"
export const releaseApkRelativePath =
  "android/app/build/outputs/apk/release/app-release.apk"
export const alphaReleaseChecksumName = "SHA256SUMS"
export const alphaReleaseNotesName = "RELEASE_NOTES.md"

export function getMissingSigningEnv(env = process.env) {
  return requiredSigningEnv.filter((key) => {
    const value = env[key]
    return value == null || value.trim() === ""
  })
}

export function formatMissingSigningEnvError(missingSigningEnv) {
  return [
    "Official Alpha Sideload APK releases must use a project release keystore.",
    "Debug keystore signing is only allowed for local development and temporary QA builds.",
    "",
    "Missing signing environment variables:",
    ...missingSigningEnv.map((key) => `- ${key}`),
  ].join("\n")
}

export function extractApkSignerCertificateFingerprint(apksignerOutput) {
  const match = apksignerOutput.match(
    /certificate SHA-256 digest:\s*([0-9a-f:]+)/i
  )

  if (!match) {
    throw new Error(
      "apksigner output did not include a certificate SHA-256 digest."
    )
  }

  return match[1].toUpperCase()
}

export function getAndroidVersionCode(env = process.env) {
  const rawVersionCode = env.CUSTOMER_ANDROID_VERSION_CODE
  if (rawVersionCode == null || String(rawVersionCode).trim() === "") {
    throw new Error(
      "CUSTOMER_ANDROID_VERSION_CODE must be set to a monotonically increasing positive integer."
    )
  }

  const versionCode = String(rawVersionCode).trim()
  if (!/^[1-9][0-9]*$/.test(versionCode)) {
    throw new Error(
      "CUSTOMER_ANDROID_VERSION_CODE must be a monotonically increasing positive integer."
    )
  }

  return versionCode
}

export async function getAlphaReleaseMetadata({
  projectRoot = defaultProjectRoot(),
  env = process.env,
} = {}) {
  const appJson = JSON.parse(await readFile(join(projectRoot, "app.json"), "utf8"))
  const version = appJson?.expo?.version
  if (!version) {
    throw new Error("apps/customer-android/app.json must define expo.version.")
  }

  const alphaNumber = env.CUSTOMER_ANDROID_ALPHA_NUMBER || "1"
  if (!/^[1-9][0-9]*$/.test(alphaNumber)) {
    throw new Error("CUSTOMER_ANDROID_ALPHA_NUMBER must be a positive integer.")
  }

  const assetBaseName = `customer-phone-agent-${version}-alpha.${alphaNumber}`
  return {
    version,
    alphaNumber,
    displayVersion: `${version}-alpha.${alphaNumber}`,
    assetBaseName,
    artifactName: `${assetBaseName}.apk`,
    signingName: `${assetBaseName}.signing.txt`,
  }
}

export async function findApksigner({
  env = process.env,
  homeDir = homedir(),
  androidDir,
} = {}) {
  const explicitApksigner = env.CUSTOMER_ANDROID_APKSIGNER || env.APKSIGNER
  if (explicitApksigner) {
    const resolvedApksigner = resolve(explicitApksigner)
    if (await fileExists(resolvedApksigner)) {
      return resolvedApksigner
    }

    throw new Error(`Configured apksigner does not exist: ${resolvedApksigner}`)
  }

  const sdkRoots = [
    env.ANDROID_HOME,
    env.ANDROID_SDK_ROOT,
    await readAndroidSdkDir(androidDir),
    join(homeDir, "Library/Android/sdk"),
  ].filter(Boolean)

  for (const sdkRoot of sdkRoots) {
    const buildToolsDir = join(sdkRoot, "build-tools")
    const versions = await listDirectories(buildToolsDir)
    const newestFirst = versions.sort((left, right) =>
      right.localeCompare(left, undefined, { numeric: true })
    )

    for (const version of newestFirst) {
      const candidate = join(buildToolsDir, version, "apksigner")
      if (await fileExists(candidate)) {
        return candidate
      }
    }
  }

  throw new Error(
    [
      "Android SDK apksigner is required to publish an official Alpha Sideload APK.",
      "Set ANDROID_HOME, ANDROID_SDK_ROOT, or CUSTOMER_ANDROID_APKSIGNER.",
    ].join("\n")
  )
}

export async function createReleaseArtifacts({
  projectRoot = defaultProjectRoot(),
  env = process.env,
  runCommand = spawnCommand,
} = {}) {
  const androidDir = join(projectRoot, "android")
  const gradlew = process.platform === "win32" ? "gradlew.bat" : "./gradlew"
  const metadata = await getAlphaReleaseMetadata({ projectRoot, env })
  const versionCode = getAndroidVersionCode(env)
  const buildEnv = {
    ...env,
    CUSTOMER_ANDROID_VERSION_CODE: versionCode,
  }

  await runCommand(gradlew, [":app:assembleRelease"], {
    cwd: androidDir,
    env: buildEnv,
    label: "Gradle release build",
  })

  const sourceApkPath = join(projectRoot, releaseApkRelativePath)
  if (!(await fileExists(sourceApkPath))) {
    throw new Error(
      `Gradle release APK was not found after assembleRelease: ${sourceApkPath}`
    )
  }

  const outputDir = join(projectRoot, alphaReleaseOutputDir)
  const artifactPath = join(outputDir, metadata.artifactName)
  const checksumPath = join(outputDir, alphaReleaseChecksumName)
  const fingerprintPath = join(outputDir, metadata.signingName)
  const releaseNotesPath = join(outputDir, alphaReleaseNotesName)

  await mkdir(dirname(artifactPath), { recursive: true })
  await copyFile(sourceApkPath, artifactPath)

  const sha256 = await writeSha256File(artifactPath, checksumPath)
  const apksignerPath = await findApksigner({ env: buildEnv, androidDir })
  const apksignerResult = await runCommand(
    apksignerPath,
    ["verify", "--print-certs", artifactPath],
    {
      cwd: projectRoot,
      env: buildEnv,
      label: "APK signature verification",
    }
  )
  const certificateSha256Fingerprint =
    extractApkSignerCertificateFingerprint(apksignerResult.stdout)
  const commitHash = await resolveCommitHash({
    projectRoot,
    env: buildEnv,
    runCommand,
  })

  await writeFile(
    fingerprintPath,
    [
      `APK: ${metadata.artifactName}`,
      `Certificate SHA-256 fingerprint: ${certificateSha256Fingerprint}`,
      "",
    ].join("\n")
  )
  await writeFile(
    releaseNotesPath,
    formatReleaseNotes({
      metadata,
      versionCode,
      commitHash,
      sha256,
      certificateSha256Fingerprint,
    })
  )

  return {
    artifactPath,
    checksumPath,
    fingerprintPath,
    releaseNotesPath,
    sha256,
    certificateSha256Fingerprint,
    commitHash,
    versionCode,
    metadata,
  }
}

export async function releaseAlpha({
  projectRoot = defaultProjectRoot(),
  env = process.env,
  stderr = process.stderr,
  stdout = process.stdout,
  runCommand = spawnCommand,
} = {}) {
  const missingSigningEnv = getMissingSigningEnv(env)
  if (missingSigningEnv.length > 0) {
    stderr.write(`${formatMissingSigningEnvError(missingSigningEnv)}\n`)
    return { exitCode: 1 }
  }

  try {
    const artifacts = await createReleaseArtifacts({ projectRoot, env, runCommand })
    stdout.write(
      [
        "Alpha Sideload APK release artifacts are ready.",
        `APK: ${toProjectRelativePath(projectRoot, artifacts.artifactPath)}`,
        `SHA-256: ${artifacts.sha256}`,
        `Checksum: ${toProjectRelativePath(projectRoot, artifacts.checksumPath)}`,
        `Signing fingerprint: ${toProjectRelativePath(
          projectRoot,
          artifacts.fingerprintPath
        )}`,
        `Release notes: ${toProjectRelativePath(
          projectRoot,
          artifacts.releaseNotesPath
        )}`,
        "",
      ].join("\n")
    )
    return { exitCode: 0, artifacts }
  } catch (error) {
    stderr.write(`${error.message}\n`)
    return { exitCode: 1 }
  }
}

export async function spawnCommand(command, args, options = {}) {
  const { cwd, env = process.env, label = command } = options

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env,
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
    child.on("error", (error) => {
      reject(error)
    })
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr })
        return
      }

      reject(
        new Error(
          [
            `${label} failed with exit code ${code}.`,
            stderr.trim(),
            stdout.trim(),
          ]
            .filter(Boolean)
            .join("\n")
        )
      )
    })
  })
}

async function writeSha256File(filePath, checksumPath) {
  const hash = createHash("sha256")
  await new Promise((resolvePromise, reject) => {
    const stream = createReadStream(filePath)
    stream.on("data", (chunk) => hash.update(chunk))
    stream.on("error", reject)
    stream.on("end", resolvePromise)
  })

  const digest = hash.digest("hex")
  await writeFile(checksumPath, `${digest}  ${basename(filePath)}\n`)
  return digest
}

async function resolveCommitHash({ projectRoot, env, runCommand }) {
  if (env.CUSTOMER_ANDROID_RELEASE_COMMIT) {
    return env.CUSTOMER_ANDROID_RELEASE_COMMIT
  }
  if (env.GITHUB_SHA) {
    return env.GITHUB_SHA
  }

  const result = await runCommand("git", ["rev-parse", "HEAD"], {
    cwd: projectRoot,
    env,
    label: "Git commit lookup",
  })
  return result.stdout.trim()
}

function formatReleaseNotes({
  metadata,
  versionCode,
  commitHash,
  sha256,
  certificateSha256Fingerprint,
}) {
  return `# Customer Phone Agent ${metadata.displayVersion}

Alpha Sideload APK for internal QA of the Customer App Story.

## Assets

- APK: \`${metadata.artifactName}\`
- Checksum file: \`${alphaReleaseChecksumName}\`
- Signing fingerprint: \`${metadata.signingName}\`

## Install

1. Download \`${metadata.artifactName}\` from this GitHub Release.
2. Install the APK on a physical Android phone.
3. Open Customer Phone Agent.
4. Grant the required Android permissions when prompted.
5. Enter a command and start the task from the app.

## Required Android Permissions

- Accessibility Service for local phone control.
- Screen capture / MediaProjection for observing the current phone state.
- Network access for hosted runtime and model-provider communication.

## Known Limitations

- This is an Alpha Sideload APK for internal QA, not a Play Store, AAB, beta, or production release.
- The first Customer App Story excludes payment, captcha, login recovery, and irreversible account changes.
- Source-built APKs are developer builds and may not upgrade over this official APK because Android requires matching package name and signing identity.

## Verification

- Commit: \`${commitHash}\`
- Android version code: \`${versionCode}\`
- SHA-256: \`${sha256}\`
- Signing certificate SHA-256 fingerprint: \`${certificateSha256Fingerprint}\`
`
}

async function fileExists(path) {
  try {
    await stat(path)
    return true
  } catch (error) {
    if (error.code === "ENOENT") {
      return false
    }
    throw error
  }
}

async function listDirectories(path) {
  try {
    const entries = await readdir(path, { withFileTypes: true })
    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
  } catch (error) {
    if (error.code === "ENOENT") {
      return []
    }
    throw error
  }
}

function defaultProjectRoot() {
  return resolve(dirname(fileURLToPath(import.meta.url)), "..")
}

function toProjectRelativePath(projectRoot, path) {
  return relative(projectRoot, path).split(sep).join("/")
}

async function readAndroidSdkDir(androidDir) {
  if (!androidDir) {
    return undefined
  }

  try {
    const localProperties = await readFile(
      join(androidDir, "local.properties"),
      "utf8"
    )
    const sdkDirLine = localProperties
      .split(/\r?\n/)
      .find((line) => line.trim().startsWith("sdk.dir="))

    if (!sdkDirLine) {
      return undefined
    }

    return sdkDirLine.slice(sdkDirLine.indexOf("=") + 1).trim()
  } catch (error) {
    if (error.code === "ENOENT") {
      return undefined
    }
    throw error
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { exitCode } = await releaseAlpha()
  process.exit(exitCode)
}
