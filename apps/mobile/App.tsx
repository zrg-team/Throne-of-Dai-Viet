import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { WebView, type WebViewNavigation } from 'react-native-webview';
import * as SplashScreen from 'expo-splash-screen';
import * as ScreenOrientation from 'expo-screen-orientation';
import { useKeepAwake } from 'expo-keep-awake';
import { Asset } from 'expo-asset';
import { Directory, Paths } from 'expo-file-system';
import { unzip } from 'react-native-zip-archive';
import Server from '@dr.pogodin/react-native-static-server';

import { shellDescriptorScript } from './src/descriptor';
import version from './assets/web-version.json';

/**
 * Load-bearing, and a schema number rather than a setting.
 *
 * The origin is where every save lives: `mandate:snapshot:v1` and its twelve siblings are
 * `localStorage` keys, and `localStorage` is partitioned by origin. Change this and no error is
 * raised anywhere — players simply open the app to a new game where their reign used to be.
 *
 * Above 32768 to stay clear of the ephemeral range Android hands out to other apps.
 */
const PORT = 39217;

/** The ink the HTML body paints. Splash, shell and first frame all agree on it. */
const INK = '#201a12';

/**
 * How long to hold the splash for a game that never reports in.
 *
 * A splash that waits on a message waits for ever when the message never comes — a corrupt
 * archive, a server that did not bind, a bundle that threw before Phaser. Without this, one bad
 * build ships an app that never opens. Long enough to cover a first-launch unpack of 302 files on
 * a slow phone; short enough that a broken build still shows *something*.
 */
const WATCHDOG_MS = 15_000;

// Global scope, not inside a hook. By the time a component mounts the splash may already have
// auto-hidden, and then there is nothing left to prevent.
void SplashScreen.preventAutoHideAsync();

/** `file:///a/b` → `/a/b`. Both the unzipper and the server want paths, not URLs. */
const asPath = (uri: string): string => uri.replace(/^file:\/\//, '');

export default function App() {
  const [origin, setOrigin] = useState<string>();
  const [ready, setReady] = useState(false);
  const server = useRef<Server>();

  // A reign is watched, not tapped. Without this the screen dims mid-battle.
  useKeepAwake();

  const reveal = useCallback(() => {
    setReady(true);
    void SplashScreen.hideAsync();
  }, []);

  useEffect(() => {
    let cancelled = false;

    const boot = async () => {
      await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);

      // One directory per build of the game. Present means it was already unpacked; a store update
      // brings a new build number, lands on a new name, and unpacks exactly once.
      const root = new Directory(Paths.document, `web-${version.build}`);
      if (!root.exists) {
        const [asset] = await Asset.loadAsync(require('./assets/web.zip'));
        if (!asset?.localUri) {
          throw new Error('web.zip did not resolve — run `yarn sync`');
        }
        await unzip(asPath(asset.localUri), asPath(root.uri));
      }

      const instance = new Server({
        port: PORT,
        fileDir: asPath(root.uri),
        // A player who takes a phone call must not come back to a dead origin and a white screen.
        stopInBackground: false,
      });
      const url = await instance.start();

      if (cancelled) {
        await instance.stop();
        return;
      }
      server.current = instance;
      setOrigin(url);
    };

    boot().catch((error: unknown) => {
      console.error('[shell] boot failed', error);
      // Whatever went wrong, do not strand the player behind a splash screen.
      reveal();
    });

    return () => {
      cancelled = true;
      void server.current?.stop();
    };
  }, [reveal]);

  useEffect(() => {
    const timer = setTimeout(reveal, WATCHDOG_MS);
    return () => clearTimeout(timer);
  }, [reveal]);

  /**
   * Nothing may navigate away from the game — that is what makes this an app rather than a browser
   * pointed at one, and it is the first thing App Store review looks for under guideline 4.2.
   *
   * But the menu has real outbound links, and `openExternalLink` in the game builds them as
   * `<a target="_blank">`. With `setSupportMultipleWindows={false}` that arrives here as an
   * ordinary navigation, so blocking it without handing it on would make "Help build the game" do
   * nothing at all. Off-origin goes to the system browser; the web view stays where it is.
   */
  const handleRequest = useCallback(
    (request: WebViewNavigation): boolean => {
      if (!origin || request.url.startsWith(origin)) {
        return true;
      }
      if (/^https?:/.test(request.url)) {
        void Linking.openURL(request.url).catch(() => {
          // No browser, or a URL the OS refuses. The link not opening is the whole consequence.
        });
      }
      return false;
    },
    [origin],
  );

  return (
    <View style={styles.root}>
      {origin ? (
        <WebView
          source={{ uri: origin }}
          // Held invisible until the game reports a painted frame, so the handoff is splash → menu
          // with nothing in between. The watchdog above is what guarantees this ever becomes 1.
          style={[styles.web, { opacity: ready ? 1 : 0 }]}
          originWhitelist={[`http://127.0.0.1:${PORT}*`, `http://localhost:${PORT}*`]}
          onShouldStartLoadWithRequest={handleRequest}
          // Before the bundle's first line: `src/main.ts` reads the descriptor at module scope.
          injectedJavaScriptBeforeContentLoaded={shellDescriptorScript()}
          onMessage={(event) => {
            if (event.nativeEvent.data === 'boot:ready') {
              reveal();
            }
          }}
          // A game canvas, not a document.
          scrollEnabled={false}
          bounces={false}
          overScrollMode="never"
          setSupportMultipleWindows={false}
          javaScriptEnabled
          domStorageEnabled
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          // Every byte is local and immutable per build; an HTTP cache on top of that is a second
          // copy of files that cannot go stale.
          cacheEnabled={false}
          androidLayerType="hardware"
          // An inspection hole in anything but a debug build.
          webviewDebuggingEnabled={__DEV__}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: INK },
  web: { flex: 1, backgroundColor: INK },
});
