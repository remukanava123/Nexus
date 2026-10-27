// Runs before every build (npm run dist). The version in package.json is the one number for a release:
// the installer name, the exe's Properties, Settings > About and the update check all read it. This only
// makes sure the "What's new" text exists for it.
const pkg = require('../package.json');
const notes = require('../shared/release-notes.js');
if (!notes[pkg.version]) {
  console.error(`\nVersion ${pkg.version} (package.json) has no entry in shared/release-notes.js.\nAdd one, or change the version, then run the build again.\n`);
  process.exit(1);
}
console.log(`Building Nexus ${pkg.version}: installer "Nexus Setup ${pkg.version}.exe"`);
