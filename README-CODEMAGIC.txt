ANTY'S PVZ2 SAVE EDITOR — CODEMAGIC PROJECT

This is the plant-editing version of the save editor (world editing excluded), prepared for Codemagic's cloud iOS build process.

PROJECT CONTENTS
- Website files are in www/
- Capacitor configuration is in capacitor.config.ts
- codemagic.yaml creates the native iOS project, syncs web assets, and builds and packages an unsigned IPA without requesting Ad Hoc signing.

HOW TO USE
1. Extract this ZIP.
2. Upload the CONTENTS of this folder to the ROOT of a GitHub repository (not the outer folder itself).
3. In Codemagic, add/connect that GitHub repository and select the codemagic.yaml workflow.
4. Select the `ios-ipa-unsigned` workflow and start the build. Download `Antys_Save_Editor_unsigned.ipa` from Artifacts if it succeeds.
5. The IPA is unsigned and will not install directly. It must be signed later with a valid certificate and matching provisioning profile.

IMPORTANT SIGNING LIMITATION
- This ZIP is source code, not an IPA.
- A .p12 certificate by itself is not enough. Codemagic requires a matching provisioning profile as well.
- The Zeus-provided .p12 has no matching profile supplied, so it may not be usable for this build. Do not upload the certificate unless you trust the issuer and understand that it contains a private signing key.
- Apple iOS signing for device installation requires appropriate Apple Developer signing access. Codemagic cannot create a valid profile for an unrelated certificate/team or turn a free Apple Account into a paid Developer Program membership.
- Never put certificates, private keys, certificate passwords, Apple passwords, or API keys in GitHub.

This workflow intentionally avoids signing during the build. The resulting IPA must be signed before installation; an unsigned IPA is only a package to pass to a trusted signing workflow/service.
