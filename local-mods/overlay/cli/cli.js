#!/usr/bin/env node

const { spawn, exec, execSync } = require("child_process");
const path = require("path");
const fs = require("fs");
const https = require("https");
const os = require("os");

const pkg = require("./package.json");
const { ensureSqliteRuntime, buildEnvWithRuntime } = require("./hooks/sqliteRuntime");
const { ensureTrayRuntime } = require("./hooks/trayRuntime");
const args = process.argv.slice(2);

// Self-heal SQLite runtime deps (sql.js + better-sqlite3) into ~/.9router/runtime
// so the server can resolve them via NODE_PATH. Best-effort — sql.js is required,
// better-sqlite3 is optional. Logs to stderr only on failure.
try { ensureSqliteRuntime({ silent: true }); } catch {}

// Self-heal tray runtime (systray for macOS/Linux only). Windows skipped.
try { ensureTrayRuntime({ silent: true }); } catch {}

// Configuration constants
const APP_NAME = pkg.name; // Use from package.json
const UPDATE_REPO = "hamsa0x7/9router";
const UPDATE_API_URL = `https://api.github.com/repos/${UPDATE_REPO}/releases/latest`;
const UPDATE_SKIP_ENV = "NINE_ROUTER_SKIP_FORK_UPDATE";

const DEFAULT_PORT = 20128;
const DEFAULT_HOST = "0.0.0.0";
const MAX_PORT_ATTEMPTS = 10;
// Identifiers for killAllAppProcesses - only kill 9router specifically
const PROCESS_IDENTIFIERS = [
  '9router'  // Only package name - avoid killing other apps
];

// Parse arguments
let port = DEFAULT_PORT;
let host = DEFAULT_HOST;
let noBrowser = false;
let showLog = false;
let trayMode = true; // Default: tray mode (start + dashboard + tray)
let menuMode = false; // Explicit --menu flag to get old interactive menu

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--port" || args[i] === "-p") {
    port = parseInt(args[i + 1], 10) || DEFAULT_PORT;
    i++;
  } else if (args[i] === "--host" || args[i] === "-H") {
    host = args[i + 1] || DEFAULT_HOST;
    i++;
  } else if (args[i] === "--no-browser" || args[i] === "-n") {
    noBrowser = true;
  } else if (args[i] === "--log" || args[i] === "-l") {
    showLog = true;
  } else if (args[i] === "--tray" || args[i] === "-t") {
    trayMode = true;
    process.env.TRAY_MODE = "1";
  } else if (args[i] === "--menu" || args[i] === "-m") {
    menuMode = true;
    trayMode = false;
  } else if (args[i] === "--help" || args[i] === "-h") {
    console.log(`
Usage: ${APP_NAME} [options]

Options:
  -p, --port <port>   Port to run the server (default: ${DEFAULT_PORT})
  -H, --host <host>   Host to bind (default: ${DEFAULT_HOST})
  -n, --no-browser    Don't open browser automatically
  -l, --log           Show server logs (default: hidden)
  -m, --menu          Show interactive menu (legacy mode)
  -h, --help          Show this help message
  -v, --version       Show version

Default behavior: start server, open dashboard, minimize to tray.
`);
    process.exit(0);
  } else if (args[i] === "--version" || args[i] === "-v") {
    console.log(pkg.version);
    process.exit(0);
  }
}

// Windows early detach: if we're in a terminal (TTY) and tray mode is on,
// immediately spawn a detached background process and exit. This way the
// terminal closes in <1s and only the background process does the real work
// (kill old instances, start server, tray icon). Without this,
// closing the terminal window force-kills everything in its console group.
if (trayMode && process.platform === "win32" && process.stdout && process.stdout.isTTY && !process.env.IS_DETACHED) {
  const bgArgs = [__filename];
  const origArgs = process.argv.slice(2);
  if (!origArgs.includes("--tray") && !origArgs.includes("-t")) bgArgs.push("--tray");
  bgArgs.push(...origArgs);

  const bgProcess = spawn(process.execPath, bgArgs, {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
    env: { ...process.env, IS_DETACHED: "1" }
  });
  bgProcess.unref();

  console.log(`\n🚀 9Router starting in background (PID: ${bgProcess.pid})`);
  console.log(`   Server will be at: http://localhost:${port}`);
  console.log(`\n💡 You can close this terminal. Right-click tray icon to quit.\n`);
  process.exit(0);
}

// Always use Node.js runtime with absolute path
const RUNTIME = process.execPath;

function normalizeVersion(version) {
  return String(version || "").trim().replace(/^v/i, "").split(/[+-]/)[0];
}

function compareVersions(a, b) {
  const partsA = normalizeVersion(a).split(".").map((part) => parseInt(part, 10) || 0);
  const partsB = normalizeVersion(b).split(".").map((part) => parseInt(part, 10) || 0);
  for (let i = 0; i < 3; i++) {
    if (partsA[i] > partsB[i]) return 1;
    if (partsA[i] < partsB[i]) return -1;
  }
  return 0;
}

function fetchJson(url, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      timeout: timeoutMs,
      headers: {
        "Accept": "application/vnd.github+json",
        "User-Agent": `${APP_NAME}/${pkg.version}`,
      },
    }, (res) => {
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`GitHub update check failed: HTTP ${res.statusCode}`));
          return;
        }
        try {
          resolve(JSON.parse(data));
        } catch (error) {
          reject(error);
        }
      });
    });
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy(new Error("GitHub update check timed out"));
    });
  });
}

function pickPackageAsset(release) {
  const assets = Array.isArray(release?.assets) ? release.assets : [];
  return assets.find((asset) => /\.tgz$/i.test(asset.name || "") && /9router/i.test(asset.name || ""))
    || assets.find((asset) => /\.tgz$/i.test(asset.name || ""));
}

async function checkForForkUpdate() {
  if (process.env[UPDATE_SKIP_ENV] === "1") return null;
  const release = await fetchJson(UPDATE_API_URL);
  const latestVersion = normalizeVersion(release.tag_name || release.name);
  if (!latestVersion || compareVersions(latestVersion, pkg.version) <= 0) return null;
  const asset = pickPackageAsset(release);
  if (!asset?.browser_download_url) {
    throw new Error(`v${latestVersion} is available, but no 9router .tgz release asset was found`);
  }
  return {
    version: latestVersion,
    installUrl: asset.browser_download_url,
  };
}

function spawnUpdaterAndExit(updateInfo) {
  const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
  const relaunchArgs = process.argv.slice(2);
  const updaterScript = `
const { spawn, spawnSync } = require("child_process");
const npmCmd = process.env.NINE_ROUTER_UPDATE_NPM;
const installUrl = process.env.NINE_ROUTER_UPDATE_URL;
const cliPath = process.env.NINE_ROUTER_CLI_PATH;
const relaunchArgs = JSON.parse(process.env.NINE_ROUTER_RELAUNCH_ARGS || "[]");
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
(async () => {
  await delay(1000);
  const install = spawnSync(npmCmd, ["install", "-g", installUrl], {
    stdio: process.env.NINE_ROUTER_UPDATE_STDIO === "inherit" ? "inherit" : "ignore",
    windowsHide: true,
  });
  if (install.status !== 0) process.exit(install.status || 1);
  const env = { ...process.env, ${JSON.stringify(UPDATE_SKIP_ENV)}: "1", IS_DETACHED: "1" };
  const child = spawn(process.execPath, [cliPath, ...relaunchArgs], {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
    env,
  });
  child.unref();
  process.exit(0);
})().catch(() => process.exit(1));
`;

  const child = spawn(process.execPath, ["-e", updaterScript], {
    detached: true,
    stdio: process.stdout?.isTTY ? "inherit" : "ignore",
    windowsHide: true,
    env: {
      ...process.env,
      NINE_ROUTER_UPDATE_NPM: npmCmd,
      NINE_ROUTER_UPDATE_URL: updateInfo.installUrl,
      NINE_ROUTER_CLI_PATH: __filename,
      NINE_ROUTER_RELAUNCH_ARGS: JSON.stringify(relaunchArgs),
      NINE_ROUTER_UPDATE_STDIO: process.stdout?.isTTY ? "inherit" : "ignore",
    },
  });
  child.unref();

  if (process.stdout?.isTTY) {
    console.log(`\n⬆  Updating ${APP_NAME} to v${updateInfo.version} from ${UPDATE_REPO}...`);
    console.log("   9Router will restart automatically after install.\n");
  }
  process.exit(0);
}

async function applyForkUpdateIfAvailable() {
  try {
    const updateInfo = await checkForForkUpdate();
    if (updateInfo) spawnUpdaterAndExit(updateInfo);
  } catch (error) {
    if (process.stdout?.isTTY) {
      console.warn(`[9router] update check skipped: ${error.message}`);
    }
  }
}

// Get app data dir (matches app/src/lib/dataDir.js convention)
function getAppDataDir() {
  return process.platform === "win32"
    ? path.join(process.env.APPDATA || "", "9router")
    : path.join(os.homedir(), ".9router");
}

// Kill PID from file (best-effort, removes file after)
function killByPidFile(pidFile) {
  try {
    if (!fs.existsSync(pidFile)) return;
    const pid = parseInt(fs.readFileSync(pidFile, "utf8").trim(), 10);
    if (!pid) return;
    try {
      if (process.platform === "win32") {
        execSync(`taskkill /F /T /PID ${pid}`, { stdio: "ignore", windowsHide: true, timeout: 3000 });
      } else {
        process.kill(pid, "SIGKILL");
      }
    } catch { }
    try { fs.unlinkSync(pidFile); } catch { }
  } catch { }
}

// Kill tunnel processes (cloudflared/tailscale) by their PID files
function killTunnelByPidFile() {
  const tunnelDir = path.join(getAppDataDir(), "tunnel");
  killByPidFile(path.join(tunnelDir, "cloudflared.pid"));
  killByPidFile(path.join(tunnelDir, "tailscale.pid"));
}

// Kill cloudflared whose --url targets this app's port (covers stale PID file case)
function killCloudflaredByAppPort(appPort) {
  if (!appPort) return [];
  const portMatchers = [`localhost:${appPort}`, `127.0.0.1:${appPort}`];
  const pids = [];
  try {
    if (process.platform === "win32") {
      const psCmd = `powershell -NonInteractive -WindowStyle Hidden -Command "Get-CimInstance Win32_Process -Filter 'Name=\\"cloudflared.exe\\"' | Select-Object ProcessId,CommandLine | ConvertTo-Csv -NoTypeInformation"`;
      const output = execSync(psCmd, { encoding: "utf8", windowsHide: true, timeout: 5000 });
      const lines = output.split("\n").slice(1).filter(l => l.trim());
      lines.forEach(line => {
        if (portMatchers.some(m => line.includes(m))) {
          const match = line.match(/^"(\d+)"/);
          if (match && match[1]) pids.push(match[1]);
        }
      });
    } else {
      const output = execSync("ps -eo pid,command 2>/dev/null", { encoding: "utf8", timeout: 5000 });
      output.split("\n").forEach(line => {
        if (line.includes("cloudflared") && portMatchers.some(m => line.includes(m))) {
          const parts = line.trim().split(/\s+/);
          const pid = parts[0];
          if (pid && !isNaN(pid)) pids.push(pid);
        }
      });
    }
  } catch { }
  return pids;
}

// Kill all 9router processes
function killAllAppProcesses(appPort) {
  return new Promise((resolve) => {
    try {
      // Kill MIT first (privileged process, needs special handling)
      killProxyByPidFile();
      // Kill cloudflared/tailscale by PID file (precise, only this app's tunnel)
      killTunnelByPidFile();

      const platform = process.platform;
      let pids = [];

      // Catch stale PID files: kill cloudflared bound to this app's port
      pids.push(...killCloudflaredByAppPort(appPort));

      if (platform === "win32") {
        // Windows: use WMI to get full CommandLine (tasklist /V doesn't include it)
        try {
          const psCmd = `powershell -NonInteractive -WindowStyle Hidden -Command "Get-CimInstance Win32_Process -Filter 'Name=\\"node.exe\\"' | Select-Object ProcessId,CommandLine | ConvertTo-Csv -NoTypeInformation"`;
          const output = execSync(psCmd, {
            encoding: "utf8",
            windowsHide: true,
            timeout: 5000
          });
          const lines = output.split("\n").slice(1).filter(l => l.trim());
          lines.forEach(line => {
            // Whitelist: real node process running 9router/cli.js, or next-server.
            // Avoids killing editors/grep/strace/cursor that just have "9router" in cmdline.
            const cmd = line.toLowerCase();
            const isAppProcess =
              (cmd.includes("node") && cmd.includes("9router") && (cmd.includes("cli.js") || cmd.includes("\\9router") || cmd.includes("/9router")))
              || cmd.includes("next-server");
            if (isAppProcess) {
              const match = line.match(/^"(\d+)"/);
              if (match && match[1] && match[1] !== process.pid.toString()) {
                pids.push(match[1]);
              }
            }
          });
        } catch (e) {
          // No processes found or error - continue
        }
      } else {
        // macOS/Linux: use ps to find all matching processes
        try {
          const output = execSync('ps aux 2>/dev/null', {
            encoding: 'utf8',
            timeout: 5000
          });
          const lines = output.split('\n');

          lines.forEach(line => {
            // Whitelist: real node process running 9router/cli.js, or next-server.
            // Avoids killing grep/strace/editors/cursor that incidentally match "9router".
            const cmd = line.toLowerCase();
            const isAppProcess =
              (cmd.includes("node") && cmd.includes("9router") && (cmd.includes("cli.js") || cmd.includes("/9router")))
              || cmd.includes("next-server");
            if (isAppProcess) {
              const parts = line.trim().split(/\s+/);
              const pid = parts[1];
              if (pid && !isNaN(pid) && pid !== process.pid.toString()) {
                pids.push(pid);
              }
            }
          });
        } catch (e) {
          // No processes found or error - continue
        }
      }

      // Kill all found processes.
      //
      // SIGSTOP-then-SIGKILL on Unix: if we just walk the list and SIGKILL each
      // PID in turn, killing the next-server child first lets the parent cli.js's
      // `server.on("close")` handler fire and run tryRestart() — spawning a new
      // next-server with a fresh PID that's not in our kill list. The orphan
      // keeps holding port :20128 and breaks Hide-to-Tray takeover. Freezing
      // every matched parent first (SIGSTOP) blocks tryRestart from ever
      // firing, so the subsequent SIGKILL is race-free.
      if (pids.length > 0) {
        if (platform !== "win32") {
          pids.forEach(pid => {
            try { execSync(`kill -STOP ${pid} 2>/dev/null`, { stdio: 'ignore', timeout: 1000 }); } catch { /* already gone */ }
          });
        }
        pids.forEach(pid => {
          try {
            if (platform === "win32") {
              execSync(`taskkill /F /PID ${pid} 2>nul`, { stdio: 'ignore', windowsHide: true, timeout: 3000 });
            } else {
              execSync(`kill -9 ${pid} 2>/dev/null`, { stdio: 'ignore', timeout: 3000 });
            }
          } catch (err) {
            // Process already dead or can't kill - continue
          }
        });

        // Wait for processes to fully terminate
        setTimeout(() => resolve(), 1000);
      } else {
        resolve();
      }
    } catch (err) {
      // Silent fail - continue anyway
      resolve();
    }
  });
}

// Sleep helper using SharedArrayBuffer wait (sync, no busy-loop)
function sleepSync(ms) {
  try { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); } catch { /* ignore */ }
}

// Wait until process dies or timeout reached
function waitForExit(pid, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try { process.kill(pid, 0); } catch { return true; }
    sleepSync(100);
  }
  return false;
}

// Kill MIT server by PID file (runs privileged, needs special handling)
// Sends SIGTERM first so MIT can clean up host entries before dying.
function killProxyByPidFile() {
  try {
    const pidFile = path.join(getAppDataDir(), "mitm", ".mitm.pid");
    if (!fs.existsSync(pidFile)) return;
    const pid = parseInt(fs.readFileSync(pidFile, "utf8").trim(), 10);
    if (!pid) return;

    if (process.platform === "win32") {
      // Graceful first (lets server cleanup hosts), then force
      try { execSync(`taskkill /T /PID ${pid}`, { stdio: "ignore", windowsHide: true, timeout: 2000 }); } catch { }
      if (!waitForExit(pid, 1500)) {
        try { execSync(`taskkill /F /T /PID ${pid}`, { stdio: "ignore", windowsHide: true, timeout: 3000 }); } catch { }
      }
      // Last-resort: PowerShell Stop-Process (sometimes succeeds where taskkill fails on admin processes)
      if (!waitForExit(pid, 500)) {
        try { execSync(`powershell -NonInteractive -WindowStyle Hidden -Command "Stop-Process -Id ${pid} -Force"`, { stdio: "ignore", windowsHide: true, timeout: 3000 }); } catch { }
      }
    } else {
      // SIGTERM via cached sudo token first
      try { execSync(`sudo -n kill -TERM ${pid} 2>/dev/null`, { stdio: "ignore", timeout: 2000 }); }
      catch { try { process.kill(pid, "SIGTERM"); } catch { } }
      if (!waitForExit(pid, 1500)) {
        try { execSync(`sudo -n kill -9 ${pid} 2>/dev/null`, { stdio: "ignore", timeout: 2000 }); }
        catch { try { process.kill(pid, "SIGKILL"); } catch { } }
      }
    }
    try { fs.unlinkSync(pidFile); } catch { }
  } catch { }
}

// Kill any process on specific port
function killProcessOnPort(port) {
  return new Promise((resolve) => {
    try {
      const platform = process.platform;
      let pid;

      if (platform === "win32") {
        try {
          const output = execSync(`netstat -ano | findstr :${port}`, {
            encoding: 'utf8',
            windowsHide: true,
            timeout: 5000
          }).trim();
          const lines = output.split('\n').filter(l => l.includes('LISTENING'));
          if (lines.length > 0) {
            pid = lines[0].trim().split(/\s+/).pop();
            execSync(`taskkill /F /PID ${pid} 2>nul`, { stdio: 'ignore', windowsHide: true, timeout: 3000 });
          }
        } catch (e) {
          // Port is free or error
        }
      } else {
        // macOS/Linux
        try {
          const pidOutput = execSync(`lsof -ti:${port}`, {
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'ignore']
          }).trim();
          if (pidOutput) {
            pid = pidOutput.split('\n')[0];
            execSync(`kill -9 ${pid} 2>/dev/null`, { stdio: 'ignore', timeout: 3000 });
          }
        } catch (e) {
          // Port is free or error
        }
      }

      // Wait for port to be released
      setTimeout(() => resolve(), 500);
    } catch (err) {
      // Silent fail - continue anyway
      resolve();
    }
  });
}


// Detect if running in restricted environment (Codespaces, Docker)
function isRestrictedEnvironment() {
  // Check for Codespaces
  if (process.env.CODESPACES === "true" || process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN) {
    return "GitHub Codespaces";
  }

  // Check for Docker
  if (fs.existsSync("/.dockerenv") || (fs.existsSync("/proc/1/cgroup") && fs.readFileSync("/proc/1/cgroup", "utf8").includes("docker"))) {
    return "Docker";
  }

  return null;
}

// Open browser
function openBrowser(url) {
  const platform = process.platform;
  let cmd;

  if (platform === "darwin") {
    cmd = `open "${url}"`;
  } else if (platform === "win32") {
    cmd = `start "" "${url}"`;
  } else {
    cmd = `xdg-open "${url}"`;
  }

  exec(cmd, { windowsHide: true }, (err) => {
    if (err) {
      console.log(`Open browser manually: ${url}`);
    }
  });
}

// Find standalone server (bundled in bin/app for published package)
const standaloneDir = path.join(__dirname, "app");
const serverPath = path.join(standaloneDir, "server.js");

if (!fs.existsSync(serverPath)) {
  console.error("Error: Standalone build not found.");
  console.error("Please run 'npm run build:cli' first.");
  process.exit(1);
}

// Check the fork release first, install automatically if needed, then start.
(async () => {
  await applyForkUpdateIfAvailable();
  await killAllAppProcesses(port);
  await killProcessOnPort(port);
  startServer();
})();

// Show interface selection menu
async function showInterfaceMenu() {
  const { selectMenu } = require("./src/cli/utils/input");
  const { clearScreen } = require("./src/cli/utils/display");
  const { getEndpoint } = require("./src/cli/utils/endpoint");

  clearScreen();

  const displayHost = host === DEFAULT_HOST ? "localhost" : host;

  // Detect tunnel/local mode for server URL display
  let serverUrl;
  try {
    const { endpoint, tunnelEnabled } = await getEndpoint(port);
    serverUrl = tunnelEnabled ? endpoint.replace(/\/v1$/, "") : `http://${displayHost}:${port}`;
  } catch (e) {
    serverUrl = `http://${displayHost}:${port}`;
  }

  const subtitle = `🚀 Server: \x1b[32m${serverUrl}\x1b[0m`;

  const menuItems = [
    { label: "Web UI (Open in Browser)", icon: "🌐" },
    { label: "Terminal UI (Interactive CLI)", icon: "💻" },
    { label: "Hide to Tray (Background)", icon: "🔔" },
    { label: "Exit", icon: "🚪" }
  ];

  const selected = await selectMenu(`Choose Interface (v${pkg.version})`, menuItems, 0, subtitle);

  if (selected === 0) return "web";
  if (selected === 1) return "terminal";
  if (selected === 2) return "hide";
  return "exit";
}

const MAX_RESTARTS = 2;
const RESTART_RESET_MS = 30000; // Reset counter if alive > 30s

function startServer() {
  const displayHost = host === DEFAULT_HOST ? "localhost" : host;
  const url = `http://${displayHost}:${port}/dashboard`;

  let restartCount = 0;
  let serverStartTime = Date.now();

  const CRASH_LOG_LINES = 50;
  let crashLog = [];

  function spawnServer() {
    serverStartTime = Date.now();
    crashLog = [];
    const child = spawn(RUNTIME, ["--max-old-space-size=6144", serverPath], {
      cwd: standaloneDir,
      stdio: showLog ? "inherit" : ["ignore", "ignore", "pipe"],
      detached: true,
      windowsHide: true,
      env: {
        ...buildEnvWithRuntime(process.env),
        PORT: port.toString(),
        HOSTNAME: host
      }
    });
    if (!showLog && child.stderr) {
      child.stderr.on("data", (data) => {
        const lines = data.toString().split("\n").filter(Boolean);
        crashLog.push(...lines);
        if (crashLog.length > CRASH_LOG_LINES) crashLog = crashLog.slice(-CRASH_LOG_LINES);
      });
    }
    return child;
  }

  let server = spawnServer();

  // Cleanup function - force kill server process
  let isCleaningUp = false;
  function cleanup() {
    if (isCleaningUp) return;
    isCleaningUp = true;
    try {
      // Kill tray if running
      try {
        const { killTray } = require("./src/cli/tray/tray");
        killTray();
      } catch (e) { }
      // Kill MIT server (privileged process) via PID file
      killProxyByPidFile();
      // Kill cloudflared/tailscale via PID file (only this app's tunnel)
      killTunnelByPidFile();
      // Kill server process (and process tree on Windows)
      if (server.pid) {
        if (process.platform === "win32") {
          try { execSync(`taskkill /F /T /PID ${server.pid}`, { stdio: "ignore", windowsHide: true, timeout: 3000 }); } catch (e) { }
        } else {
          try { process.kill(-server.pid, "SIGKILL"); } catch (e) { }
          try { process.kill(server.pid, "SIGKILL"); } catch (e) { }
        }
      }
    } catch (e) { }
  }

  // Suppress all errors during shutdown (systray lib throws JSON parse errors)
  let isShuttingDown = false;
  process.on("uncaughtException", (err) => {
    if (isShuttingDown) return;
    console.error("Error:", err.message);
  });

  // Handle all exit scenarios
  process.on("SIGINT", () => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    console.log("\nExiting...");
    cleanup();
    setTimeout(() => process.exit(0), 100);
  });
  process.on("SIGTERM", () => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    cleanup();
    setTimeout(() => process.exit(0), 100);
  });
  process.on("SIGHUP", () => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    cleanup();
    setTimeout(() => process.exit(0), 100);
  });
  // Windows: handle console window close (CTRL_CLOSE_EVENT → SIGBREAK)
  if (process.platform === "win32") {
    process.on("SIGBREAK", () => {
      if (isShuttingDown) return;
      isShuttingDown = true;
      cleanup();
      setTimeout(() => process.exit(0), 100);
    });
  }

  // Initialize tray icon (runs alongside TUI)
  const initTrayIcon = () => {
    try {
      const { initTray } = require("./src/cli/tray/tray");
      initTray({
        port,
        onQuit: () => {
          isShuttingDown = true;
          console.log("\n👋 Shutting down from tray...");
          cleanup();
          setTimeout(() => process.exit(0), 100);
        },
        onOpenDashboard: () => openBrowser(url)
      });
    } catch (err) {
      // Tray not available - continue without it
    }
  };

  // Tray-only mode: no TUI, just tray icon + optional browser open
  // On Windows, the early-detach block (before update check) already handled
  // spawning a background process, so we only reach here as the detached instance.
  if (trayMode) {
    // Ignore SIGHUP so macOS terminal close doesn't kill the background tray process
    process.removeAllListeners("SIGHUP");
    process.on("SIGHUP", () => {});

    console.log(`\n🚀 ${pkg.name} v${pkg.version}`);
    console.log(`Server: http://${displayHost}:${port}`);

    // Attach server crash/restart handlers so tray mode recovers from server death
    attachServerEvents();

    // Keep the Node.js event loop alive — without this, the process silently
    // exits when all stdio pipes close and no other refs remain.
    setInterval(() => {}, 60000);

    setTimeout(() => {
      initTrayIcon();
      console.log("\n💡 Router is now running in system tray.");
      console.log("   Double-click tray icon to open dashboard, right-click for menu.\n");
    }, 2000);

    return;
  }

  // Wait for server to be ready, then show interface menu loop + tray
  setTimeout(async () => {
    // Start tray icon alongside TUI
    initTrayIcon();

    try {
      while (true) {
        const choice = await showInterfaceMenu();

        if (choice === "web") {
          openBrowser(url);
          // Wait for user to come back
          const { pause } = require("./src/cli/utils/input");
          await pause("\nPress Enter to go back to menu...");
        } else if (choice === "terminal") {
          // Start Terminal UI - it will return when user selects Back
          const { startTerminalUI } = require("./src/cli/terminalUI");
          await startTerminalUI(port);
          // Loop continues, show menu again
        } else if (choice === "hide") {
          const { clearScreen } = require("./src/cli/utils/display");
          clearScreen();

          // Enable auto startup on OS boot
          try {
            const { enableAutoStart } = require("./src/cli/tray/autostart");
            enableAutoStart(__filename);
          } catch (e) { }

          if (process.platform === "darwin") {
            // macOS: keep current process alive — spawning a detached child puts
            // it outside the login session so NSStatusItem silently fails.
            process.removeAllListeners("SIGHUP");
            process.on("SIGHUP", () => {});

            console.log(`\n⏳ Switching to tray mode... (icon already visible in menu bar)`);
            console.log(`🔔 9Router is running in tray (PID: ${process.pid})`);
            console.log(`   Server: http://${displayHost}:${port}`);
            console.log(`\n💡 You can close this terminal. Right-click tray icon to quit.\n`);

            // Tray already init'd at startup — just keep event loop alive.
            return;
          }

          // Windows/Linux: spawn detached bgProcess (systray works fine in child)
          console.log(`\n⏳ Starting background process... (tray icon will appear in ~3s)`);

          const bgProcess = spawn(process.execPath, [__filename, "--tray", "-p", port.toString()], {
            detached: true,
            stdio: "ignore",
            windowsHide: true,
            env: { ...process.env }
          });
          bgProcess.unref();

          console.log(`🔔 9Router is now running in background (PID: ${bgProcess.pid})`);
          console.log(`   Server: http://${displayHost}:${port}`);
          console.log(`\n💡 You can close this terminal. Right-click tray icon to quit.\n`);

          // cleanup() kills server so bgProcess can claim the port fresh
          cleanup();
          process.exit(0);
        } else if (choice === "exit") {
          isShuttingDown = true;
          console.log("\nExiting...");
          cleanup();
          setTimeout(() => process.exit(0), 100);
        }
      }
    } catch (err) {
      console.error("Error:", err.message);
      cleanup();
      process.exit(1);
    }
  }, 3000);

  function attachServerEvents() {
    server.on("error", (err) => {
      console.error("Failed to start server:", err.message);
      if (!isShuttingDown) tryRestart();
      else { cleanup(); process.exit(1); }
    });

    server.on("close", (code) => {
      if (isShuttingDown || code === 0) {
        process.exit(code || 0);
        return;
      }
      tryRestart(code);
    });
  }

  function tryRestart(code) {
    const aliveMs = Date.now() - serverStartTime;
    // Reset counter if last run was stable
    if (aliveMs >= RESTART_RESET_MS) restartCount = 0;

    if (restartCount >= MAX_RESTARTS) {
      console.error(`\n⚠️  Server crashed ${MAX_RESTARTS} times. Resetting counter and restarting...`);
      restartCount = 0;
      server = spawnServer();
      attachServerEvents();
      return;
    }

    restartCount++;
    const delay = Math.min(1000 * restartCount, 10000);
    console.error(`\n⚠️  Server exited (code=${code ?? "unknown"}). Restarting in ${delay / 1000}s... (${restartCount}/${MAX_RESTARTS})`);
    if (crashLog.length) {
      console.error("\n--- Server crash log ---");
      crashLog.forEach(l => console.error(l));
      console.error("--- End crash log ---\n");
    }

    setTimeout(() => {
      server = spawnServer();
      attachServerEvents();
    }, delay);
  }

  attachServerEvents();
}
