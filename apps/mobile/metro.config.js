const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// The whole game arrives as one archive. `require('./assets/web.zip')` then behaves like any other
// asset — embedded in the release binary, resolved to a local file at runtime — which is what lets
// the same code path work on both platforms with no config plugin and no Xcode.
config.resolver.assetExts.push('zip');

module.exports = config;
