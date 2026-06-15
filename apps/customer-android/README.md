# Customer Android

This app is the Android customer-facing APK for the Customer App Story.

## Local Android Runtime

Use JDK 17 for local Android Gradle builds. The wrapper is pinned to Gradle 8.13,
matching the Android Gradle Plugin 8.12 toolchain used by the current
Expo/React Native app.

On macOS with Homebrew:

```bash
brew install openjdk@17
mkdir -p "$HOME/Library/Java/JavaVirtualMachines"
ln -sfn "$(brew --prefix openjdk@17)/libexec/openjdk.jdk" \
  "$HOME/Library/Java/JavaVirtualMachines/openjdk-17.jdk"
/usr/libexec/java_home -v 17
```

Keep the project-local Gradle runtime in `android/local.properties`, which is
ignored by git:

```properties
sdk.dir=/path/to/android/sdk
org.gradle.java.home=/absolute/path/to/jdk17/Contents/Home
```

Verify the runtime before Android work:

```bash
cd apps/customer-android/android
./gradlew --version
./gradlew :app:compileDebugKotlin
```

## Alpha Sideload APK

Official Alpha APKs must be signed with the maintainer-owned release keystore.
Debug signing is only for local development and temporary QA builds.

For maintainer builds, keep the release keystore and signing env file outside
the repository, for example:

- `$HOME/.phone-automation-agent/customer-android-release/customer-phone-agent-alpha-release.p12`
- `$HOME/.phone-automation-agent/customer-android-release/release-signing.env`

Load the private env file in the release shell, then run the release command.
Keep the directory mode restricted to the local maintainer account.
Run maintainer release builds with JDK 17.

`pnpm --dir apps/customer-android release:alpha` requires:

- `CUSTOMER_ANDROID_RELEASE_STORE_FILE`
- `CUSTOMER_ANDROID_RELEASE_STORE_PASSWORD`
- `CUSTOMER_ANDROID_RELEASE_KEY_ALIAS`
- `CUSTOMER_ANDROID_RELEASE_KEY_PASSWORD`
- `CUSTOMER_ANDROID_VERSION_CODE`

The command runs the Android release build, copies the APK to
`dist/alpha/customer-phone-agent-<version>-alpha.<n>.apk`, writes
`dist/alpha/SHA256SUMS`, writes
`dist/alpha/customer-phone-agent-<version>-alpha.<n>.signing.txt`, and writes
`dist/alpha/RELEASE_NOTES.md`.

Set `CUSTOMER_ANDROID_ALPHA_NUMBER` to override the default Alpha number `1`.
Set `CUSTOMER_ANDROID_VERSION_CODE` to a monotonically increasing positive
integer for every official Alpha APK. Android uses this value for upgrade
eligibility, so a later official Alpha must use a higher value than the APK
already installed on the phone.
Set `CUSTOMER_ANDROID_RELEASE_COMMIT` when building an APK from a specific
commit in CI or a release script.

`apksigner` is discovered from `CUSTOMER_ANDROID_APKSIGNER`, `ANDROID_HOME`,
`ANDROID_SDK_ROOT`, or `android/local.properties`.

Never commit, paste, log, or upload the real release keystore, keystore
password, key alias password, `*.jks`, `*.keystore`, or `keystore.properties`.
GitHub Release assets should contain only the APK, checksum, fingerprint, and
release notes.

Source-built APKs are developer builds. They may not upgrade over the official
Alpha APK because Android requires the package name and signing identity to
match.
