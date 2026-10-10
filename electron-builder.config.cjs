// electron-builder configuration. Identifiers come from the shared identity
// file so packaging and runtime can never disagree.
const identity = require('./src/shared/app-identity.json');

const hasMacCertificate = Boolean(process.env.CSC_LINK);
const canNotarize = Boolean(
  hasMacCertificate &&
  ((process.env.APPLE_ID && process.env.APPLE_APP_SPECIFIC_PASSWORD && process.env.APPLE_TEAM_ID) ||
    (process.env.APPLE_API_KEY && process.env.APPLE_API_KEY_ID && process.env.APPLE_API_ISSUER)),
);

/** @type {import('electron-builder').Configuration} */
module.exports = {
  appId: identity.appId,
  productName: identity.productName,
  copyright: 'Copyright © 2026 Profile Switcher contributors',
  directories: {
    output: 'release/${version}',
    buildResources: 'build',
  },
  files: ['out/**', 'package.json', '!**/*.map'],
  asar: true,
  artifactName: `${identity.slug}-\${version}-\${os}-\${arch}.\${ext}`,
  publish: null,
  mac: {
    target: [{ target: 'dmg', arch: ['arm64', 'x64'] }],
    category: 'public.app-category.developer-tools',
    icon: 'build/icon.png',
    hardenedRuntime: true,
    gatekeeperAssess: false,
    // Without a Developer ID certificate the app is ad-hoc signed ("-"), which
    // lets it run on Apple Silicon but triggers Gatekeeper warnings.
    identity: hasMacCertificate ? undefined : '-',
    notarize: canNotarize,
  },
  dmg: {
    artifactName: `${identity.slug}-\${version}-mac-\${arch}.\${ext}`,
  },
  win: {
    target: [{ target: 'nsis', arch: ['x64'] }],
    icon: 'build/icon.png',
  },
  nsis: {
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
    deleteAppDataOnUninstall: false,
    artifactName: `${identity.slug}-\${version}-win-\${arch}-setup.\${ext}`,
  },
  linux: {
    target: [
      { target: 'AppImage', arch: ['x64'] },
      { target: 'deb', arch: ['x64'] },
    ],
    category: 'Development',
    icon: 'build/icon.png',
    executableName: identity.slug,
    synopsis: 'Switch between isolated profiles for AI coding tools',
    description:
      'A desktop app to create, manage, and launch isolated profiles for AI coding tools such as Claude Code.',
    maintainer: 'Profile Switcher contributors <ifazelman@gmail.com>',
  },
  deb: {
    artifactName: `${identity.slug}_\${version}_\${arch}.\${ext}`,
  },
};
