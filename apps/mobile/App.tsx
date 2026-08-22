import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { WebView, type WebViewNavigation } from 'react-native-webview';
import * as SplashScreen from 'expo-splash-screen';
import * as ScreenOrientation from 'expo-screen-orientation';
import { useKeepAwake } from 'expo-keep-awake';
import { Asset } from 'expo-asset';
import { Directory, File, Paths } from 'expo-file-system';
import { unzip } from 'react-native-zip-archive';
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

export default function App() {
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
  // React 19 requires the initial value spelled out; `useRef<T>()` no longer implies undefined.
  const server = useRef<Server | undefined>(undefined);

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

      // One directory per build of the game. Present means it was already unpacked; a store update
      // brings a new build number, lands on a new name, and unpacks exactly once.
      const root = new Directory(Paths.document, `web-${version.build}`);
      if (!root.exists) {
        note(`unpacking build ${version.build}…`);
        const [asset] = await Asset.loadAsync(require('./assets/web.zip'));
        if (!asset?.localUri) {
          throw new Error('web.zip did not resolve — run `npm run sync`');
        }
        await unzip(asPath(asset.localUri), asPath(root.uri));
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
      <View style={styles.root}>
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
    <View style={styles.root}>
      {origin ? (
        <WebView
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

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: INK },
  web: { flex: 1, backgroundColor: INK },
  diag: { padding: 28, paddingTop: 72 },
  heading: { color: PAPER, fontSize: 20, fontWeight: '700', marginBottom: 12 },
  body: { color: '#bcb29e', fontSize: 14, lineHeight: 21, marginBottom: 18 },
  line: { color: '#8fd2c1', fontSize: 12, lineHeight: 20, fontFamily: 'monospace' },
});
