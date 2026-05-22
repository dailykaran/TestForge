module.exports = {
  appId: 'com.testforge.app',
  productName: 'TestForge',
  directories: { output: 'dist-electron' },
  win: { target: 'nsis', icon: 'public/icons/icon.ico' },
  mac: { target: 'dmg', icon: 'public/icons/icon.icns' },
  linux: { target: 'AppImage' },
  extraResources: ['resources/**'],
};
