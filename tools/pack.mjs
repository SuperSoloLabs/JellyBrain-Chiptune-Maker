import { packager } from '@electron/packager';
const out = await packager({ dir: 'app', name: 'LowOrbit Chip Studio Engine', platform: 'win32', arch: 'x64', asar: true, appVersion: process.argv[2], out: process.argv[3], overwrite: true });
console.log(out);
