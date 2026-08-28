import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { WebView, type WebViewNavigation } from 'react-native-webview';
import * as SplashScreen from 'expo-splash-screen';
import * as ScreenOrientation from 'expo-screen-orientation';
import { useKeepAwake } from 'expo-keep-awake';
import { Asset } from 'expo-asset';
import { Directory, File, Paths } from 'expo-file-system';
import { unzip } from 'react-native-zip-archive';
import * as Updates from 'expo-updates';
import Server, { ERROR_LOG_FILE, STATES } from '@dr.pogodin/react-native-static-server';

import { shellDescriptorScript } from './src/descriptor';
import version from './assets/web-version.json';

/**
 * Load-bearing, and a schema number rather than a setting.
 *
 * The origin is where every save lives: `mandate:snapshot:v1` and its twelve siblings are
 * `localStorage` keys, and `localStorage` is partitioned by origin. Change this and no error is
 * raised anywhere — players simply open the app to a new game where their reign used to be.
 */
const PORT = 39217;

/** The ink the HTML body paints. Splash, shell and first frame all agree on it. */
const INK = '#201a12';
const PAPER = '#e9dfc2';

/** How long to hold the splash for a game that never reports in. */
const WATCHDOG_MS = 20_000;

// Global scope, not inside a hook. By the time a component mounts the splash may already have
// auto-hidden, and then there is nothing left to prevent.
void SplashScreen.preventAutoHideAsync();

/** `file:///a/b` → `/a/b`. Both the unzipper and the server want paths, not URLs. */
const asPath = (uri: string): string => uri.replace(/^file:\/\//, '').replace(/\/$/, '');

/** How many times to try the origin before calling it dead, and how long to wait between. */
const KNOCKS = 10;
const KNOCK_GAP_MS = 300;

/**
 * Ask the origin for the game's own index, from the JS thread.
 *
 * Deliberately `index.html` rather than `/`: a directory index can be answered by a server that
 * cannot actually read the folder it was pointed at, and that is one of the failures worth
 * catching here rather than as a blank canvas later.
 */
async function knock(origin: string, attempts: number = KNOCKS): Promise<boolean> {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(`${origin}/index.html`, { method: 'GET' });
      if (response.ok) return true;
    } catch {
      // Refused, reset, or unresolvable — all the same answer at this level: not yet.
    }
    await new Promise((wait) => setTimeout(wait, KNOCK_GAP_MS));
  }
  return false;
}

/** lighttpd's own account of why it would not serve, if it wrote one. */
async function lighttpdLog(): Promise<string> {
  try {
    const log = new File(ERROR_LOG_FILE);
    if (!log.exists) return 'lighttpd wrote no error log';
    const tail = log.textSync().trim().split('\n').slice(-4).join(' / ');
    return tail ? `lighttpd: ${tail}` : 'lighttpd error log is empty';
  } catch (error) {
    return `lighttpd log unreadable: ${error instanceof Error ? error.message : String(error)}`;
  }
}

function Shell() {
  const [origin, setOrigin] = useState<string>();
  const [ready, setReady] = useState(false);
  /**
   * What went wrong, in the player's hands rather than in a log they cannot reach.
   *
   * Without this the failure mode is a WebView showing `ERR_CONNECTION_REFUSED` on a white page —
   * which says the server is not listening but nothing about *why*, and looks to a player like a
   * broken app rather than a broken server. Every step below appends to it.
   */
  const [diary, setDiary] = useState<string[]>([]);
  const [failed, setFailed] = useState(false);

  /**
   * The status bar and the gesture pill, kept off the game.
   *
   * `index.html` asks for `viewport-fit=cover` and pads `#game-root` by
   * `env(safe-area-inset-bottom)`, which is the right answer in Safari and no answer at all here:
   * Android's web view reports every `safe-area-inset-*` as zero, so the header printed under the
   * clock and "Choose this champion" sat beneath the home indicator. Only the shell knows the real
   * numbers, so the shell is what applies them.
   *
   * Padding the container rather than injecting the values as CSS: the game lays out against a
   * fixed 390-wide design surface and fits itself to whatever box it is handed, so handing it a
   * box that is already safe needs nothing from the game at all — and works the same on iOS, where
   * the insets are real but the game only ever compensated for the bottom one.
   */
  const insets = useSafeAreaInsets();
  // React 19 requires the initial value spelled out; `useRef<T>()` no longer implies undefined.
  const server = useRef<Server | undefined>(undefined);
  const web = useRef<WebView>(null);

  const note = useCallback((line: string) => {
    setDiary((prior) => [...prior, line]);
  }, []);

  useKeepAwake();

  const reveal = useCallback(() => {
    setReady(true);
    void SplashScreen.hideAsync();
  }, []);

  const giveUp = useCallback(
    (line: string) => {
      note(line);
      setFailed(true);
      reveal();
    },
    [note, reveal],
  );

  useEffect(() => {
    let cancelled = false;

    const boot = async () => {
      await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);

      // The archive first. Its hash is the identity of the game actually inside this binary, and
      // the only thing guaranteed to change when the game does.
      const [asset] = await Asset.loadAsync(require('./assets/web.zip'));
      if (!asset?.localUri) {
        throw new Error('web.zip did not resolve — run `npm run sync`');
      }

      /**
       * One directory per *archive*, not per build number.
       *
       * It used to be `web-${version.build}`, a number imported from a JSON file and therefore only
       * ever as fresh as the JS bundle carrying it. When a store update shipped a new game under a
       * stale bundle, the name did not move: the directory was already there, the unpack was
       * skipped, and a brand new binary served last week's game with nothing anywhere saying so.
       * It reproduced exactly — install 427, update to 446, still 427; delete and reinstall 446,
       * correct. The hash is computed from the file being unpacked, so the name and the contents
       * cannot disagree no matter what the bundle believes.
       */
      const stamp = asset.hash ?? `build-${version.build}`;
      const root = new Directory(Paths.document, `web-${stamp}`);
      if (!root.exists) {
        note(`unpacking build ${version.build}…`);
        await unzip(asPath(asset.localUri), asPath(root.uri));
      }

      /**
       * Every previously unpacked game goes with it. They are 17 MB each, nothing reads them once
       * the name above has moved, and keeping them fills a device one release at a time.
       */
      const keep = asPath(root.uri);
      for (const entry of new Directory(Paths.document).list()) {
        const path = asPath(entry.uri);
        const name = path.slice(path.lastIndexOf('/') + 1);
        if (!name.startsWith('web-') || path === keep) continue;
        // A stale copy that refuses to go is wasted space, never a reason to fail the boot.
        try { entry.delete(); } catch { /* ignored */ }
      }

      // Trust the unpack no further than a directory listing. An empty folder starts a server
      // that serves nothing, which reads downstream as a network fault rather than a bad archive.
      const index = new File(root, 'index.html');
      if (!index.exists) {
        throw new Error(`no index.html in ${asPath(root.uri)} — the archive is wrong or empty`);
      }
      note(`unpacked ok: ${root.list().length} entries`);

      const instance = new Server({
        port: PORT,
        fileDir: asPath(root.uri),
        // A player who takes a phone call must not come back to a dead origin.
        stopInBackground: false,
        // lighttpd's own log. The only account of why it refused to start.
        errorLog: { conditionHandling: true, fileNotFound: true, requestHandling: true },
      });

      /**
       * The reason the first build showed `ERR_CONNECTION_REFUSED`.
       *
       * `start()` resolving is not the same as lighttpd accepting connections, so pointing the web
       * view at the origin the moment the promise settles can beat the listening socket. The state
       * listener is the real signal; CRASHED is reported here too, which `start()` alone never
       * surfaces once it has resolved.
       */
      const unsubscribe = instance.addStateListener((state, details, error) => {
        if (state === STATES.CRASHED) {
          giveUp(`server crashed: ${details}${error ? ` — ${error.message}` : ''}`);
        }
      });

      const url = await instance.start();
      if (cancelled) {
        unsubscribe();
        await instance.stop();
        return;
      }

      server.current = instance;
      note(`server ${instance.state === STATES.ACTIVE ? 'active' : String(instance.state)} at ${url}`);

      /**
       * Knock on the door from this side before sending the web view to it.
       *
       * `ACTIVE` is lighttpd's own opinion, and the first build proved it can hold that opinion
       * while the web view gets `ERR_CONNECTION_REFUSED` from the same address. A fetch from the
       * JS thread separates the two cases: if it answers, the server is genuinely up and the
       * problem belongs to the web view; if it does not, the server is not listening whatever its
       * state says. Either way the diagnostic below can name it.
       *
       * It is also a fix rather than only a probe: a socket that needs a moment gets one, instead
       * of the web view arriving early and turning a timing wobble into a permanent error page.
       */
      const reachable = await knock(url);
      if (cancelled) return;
      if (!reachable) {
        /**
         * Reported, never switched to.
         *
         * `http://localhost:PORT` and `http://127.0.0.1:PORT` are different origins, so a shell
         * that silently preferred whichever answered would partition the save file by whichever
         * name resolved that launch. Worth knowing which one the socket is on; not worth losing a
         * reign to.
         */
        const viaName = await knock(`http://localhost:${PORT}`, 2);
        note(`localhost:${PORT} ${viaName ? 'DOES answer — a name-resolution split' : 'also refuses'}`);
        note(await lighttpdLog());
        throw new Error(`${url} accepted no connection after ${KNOCKS} attempts`);
      }

      setOrigin(url);
    };

    boot().catch((error: unknown) => {
      giveUp(`boot failed: ${error instanceof Error ? error.message : String(error)}`);
    });

    return () => {
      cancelled = true;
      void server.current?.stop();
    };
  }, [giveUp, note]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (!ready) {
        giveUp('the game did not report a painted frame within 20s');
      }
    }, WATCHDOG_MS);
    return () => clearTimeout(timer);
  }, [giveUp, ready]);

  /**
   * Content updates, offered rather than applied.
   *
   * `checkAutomatically` is NEVER and nothing here calls `reloadAsync` on its own, which is the
   * whole design: the game that launches is always the one already on the device, so a cold start
   * costs no network and cannot be changed underneath a player mid-reign. A newer bundle is
   * downloaded quietly and then *offered*, the way a PWA offers one, and it is applied only when
   * the player says so.
   *
   * Deliberately after `ready`. A check that raced the boot would compete with the unpack and the
   * server for a device's attention at the one moment the app has none to spare.
   */
  useEffect(() => {
    if (!ready || !Updates.isEnabled) return;
    let cancelled = false;
    void (async () => {
      try {
        const found = await Updates.checkForUpdateAsync();
        if (cancelled || !found.isAvailable) return;
        await Updates.fetchUpdateAsync();
        if (cancelled) return;
        /**
         * The game owns the notice, not the shell.
         *
         * It already has one — the version line at the foot of the front page, which says the same
         * thing for a waiting service worker on the web. Drawing a second bar over the canvas would
         * put two update prompts in one product and land this one in the only place the art
         * direction forbids: floating over the game. So the shell says its piece through
         * `window.__gameUpdateReady` and lets the menu render it in both languages, in the right
         * place, in ink.
         */
        web.current?.injectJavaScript('window.__gameUpdateReady && window.__gameUpdateReady(); true;');
      } catch {
        // No network, no update server, a malformed manifest: all of them mean the player keeps
        // playing what they have. An update is never worth an error in front of somebody.
      }
    })();
    return () => { cancelled = true; };
  }, [ready]);

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
        void Linking.openURL(request.url).catch(() => {});
      }
      return false;
    },
    [origin],
  );

  if (failed) {
    return (
      <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <ScrollView contentContainerStyle={styles.diag}>
          <Text style={styles.heading}>Vạn Thắng could not start</Text>
          <Text style={styles.body}>
            The game is packaged inside this app and needs no network. What follows is what the
            shell did before it stopped — please send it with any bug report.
          </Text>
          {diary.map((line, index) => (
            <Text key={`${index}-${line}`} style={styles.line}>
              · {line}
            </Text>
          ))}
          <Text style={styles.line}>· build {version.build}, port {PORT}</Text>
        </ScrollView>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.root,
        {
          paddingTop: insets.top,
          paddingBottom: insets.bottom,
          paddingLeft: insets.left,
          paddingRight: insets.right,
        },
      ]}
    >
    {origin ? (
        <WebView
          ref={web}
          source={{ uri: origin }}
          style={[styles.web, { opacity: ready ? 1 : 0 }]}
          originWhitelist={[`http://127.0.0.1:${PORT}*`, `http://localhost:${PORT}*`]}
          onShouldStartLoadWithRequest={handleRequest}
          // Before the bundle's first line: `src/main.ts` reads the descriptor at module scope.
          injectedJavaScriptBeforeContentLoaded={shellDescriptorScript()}
          onMessage={(event) => {
            if (event.nativeEvent.data === 'boot:ready') {
              reveal();
            }
            // The player tapped Reload on the version line. Restart onto the bundle already down.
            if (event.nativeEvent.data === 'update:apply') {
              void Updates.reloadAsync();
            }
          }}
          // A refused connection is the shell's fault, not the player's. Say so, rather than
          // letting the web view render a browser error page inside what claims to be a game.
          onError={({ nativeEvent }) => giveUp(`web view: ${nativeEvent.description}`)}
          onHttpError={({ nativeEvent }) =>
            giveUp(`web view: HTTP ${nativeEvent.statusCode} for ${nativeEvent.url}`)
          }
          // A game canvas, not a document.
          scrollEnabled={false}
          bounces={false}
          overScrollMode="never"
          setSupportMultipleWindows={false}
          javaScriptEnabled
          domStorageEnabled
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          cacheEnabled={false}
          androidLayerType="hardware"
          webviewDebuggingEnabled={__DEV__}
        />
      ) : null}
    </View>
  );
}

/**
 * The provider has to be above whatever calls `useSafeAreaInsets`, so the shell is an inner
 * component and this is what the app registers.
 */
export default function App() {
  return (
    <SafeAreaProvider>
      {/* Light glyphs. No backgroundColor — edge-to-edge keeps the bar transparent in SDK 57,
          and the ink padding behind it is what the glyphs actually sit on. */}
      <StatusBar style="light" />
      <Shell />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: INK },
  web: { flex: 1, backgroundColor: INK },
  diag: { padding: 28 },
  heading: { color: PAPER, fontSize: 20, fontWeight: '700', marginBottom: 12 },
  body: { color: '#bcb29e', fontSize: 14, lineHeight: 21, marginBottom: 18 },
  line: { color: '#8fd2c1', fontSize: 12, lineHeight: 20, fontFamily: 'monospace' },
});
