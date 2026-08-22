const { AndroidConfig, withAndroidManifest, withDangerousMod } = require('expo/config-plugins');
const { mkdirSync, writeFileSync } = require('node:fs');
const { dirname, join } = require('node:path');

/**
 * Lets Android talk to the loopback server, and to nothing else.
 *
 * Android blocks plain `http://` by default, so a web view pointed at `http://127.0.0.1:39217`
 * fails with `ERR_CLEARTEXT_NOT_PERMITTED` — on a device, in a release build, after you have
 * waited out a cloud build to find out.
 *
 * The blunt fix is `usesCleartextTraffic="true"` in the manifest, and it is the wrong one: that
 * permits cleartext to the entire internet, and it is exactly the kind of thing Play's security
 * review flags. This scopes the exemption to the loopback addresses and leaves every other origin
 * under the default policy.
 */
const CONFIG = `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
  <!-- The game is served from this device, by this app, over a socket that never leaves it.
       Everything else stays on the platform default: HTTPS only. -->
  <domain-config cleartextTrafficPermitted="true">
    <domain includeSubdomains="false">127.0.0.1</domain>
    <domain includeSubdomains="false">localhost</domain>
  </domain-config>
</network-security-config>
`;

const FILE = 'network_security_config.xml';

module.exports = function withLoopbackCleartext(config) {
  config = withDangerousMod(config, [
    'android',
    (cfg) => {
      const target = join(cfg.modRequest.platformProjectRoot, 'app/src/main/res/xml', FILE);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, CONFIG);
      return cfg;
    },
  ]);

  return withAndroidManifest(config, (cfg) => {
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(cfg.modResults);
    application.$['android:networkSecurityConfig'] = '@xml/network_security_config';
    return cfg;
  });
};
