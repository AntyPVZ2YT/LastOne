ANTY'S PVZ2 SAVE EDITOR — CAPWRAPP-READY WEB PROJECT

This package contains the plant-editing version of the save editor. World editing is excluded.
The website files are in www/ and Capacitor configuration is at the project root.

CAPWRAPP WORKFLOW
1. Extract this ZIP.
2. Upload the project to a GitHub repository (the files inside this folder should be at the repository root).
3. Connect that repository in CapWrapp and let it add/generate the native iOS project and build workflow.
4. Follow CapWrapp's signing checklist.

IMPORTANT
- This ZIP is a source project, not a compiled/signed .ipa file.
- CapWrapp's current docs say it expects a GitHub repository and an Apple Developer Program account for iPhone/TestFlight builds. A free Apple Account alone is not sufficient for App Store/TestFlight distribution.
- The editor runs locally in the app's web view. Save-file import/export depends on iOS file-picker/share behavior and should be tested on the resulting build.
- Do not put Apple signing certificates, private keys, passwords, or API keys in this repository.
