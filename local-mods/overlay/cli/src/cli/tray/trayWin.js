const { spawn } = require("child_process");
const path = require("path");
const readline = require("readline");

// PowerShell-based tray for Windows (AV-safe, zero binary deps)

let psProcess = null;
let clickHandler = null;
let doubleClickHandler = null;
let trayKilled = false;
let trayRestartAttempts = 0;
let lastTrayCrashTime = 0;
const MAX_TRAY_RESTARTS = 3;
const TRAY_RESTART_RESET_MS = 300000; // 5 minutes

/**
 * Send JSON command to PowerShell tray process via stdin
 */
function sendCommand(cmd) {
  if (psProcess && psProcess.stdin.writable) {
    psProcess.stdin.write(`${JSON.stringify(cmd)}\n`, "utf8");
  }
}

/**
 * Initialize Windows tray using PowerShell NotifyIcon
 * @param {Object} options - { iconPath, tooltip, items, onClick, onDoubleClick }
 *   items: [{ title, enabled }]
 * @returns {Object|null} controller with sendAction/kill
 */
function initWinTray(options) {
  const { iconPath, tooltip, items, onClick, onDoubleClick } = options;
  trayKilled = false;
  clickHandler = onClick;
  doubleClickHandler = onDoubleClick;

  const scriptPath = path.join(__dirname, "tray.ps1");

  try {
    psProcess = spawn(
      "powershell.exe",
      [
        "-NoProfile",
        "-ExecutionPolicy", "Bypass",
        "-WindowStyle", "Hidden",
        "-InputFormat", "Text",
        "-OutputFormat", "Text",
        "-File", scriptPath,
        "-IconPath", iconPath,
        "-Tooltip", tooltip
      ],
      { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] }
    );
  } catch (err) {
    return null;
  }

  const rl = readline.createInterface({ input: psProcess.stdout });
  rl.on("line", (line) => {
    try {
      const evt = JSON.parse(line);
      if (evt.type === "click" && clickHandler) {
        clickHandler(evt.index);
      } else if (evt.type === "doubleclick" && doubleClickHandler) {
        doubleClickHandler();
      }
    } catch (e) {}
  });

  psProcess.on("error", () => {});
  psProcess.stderr.on("data", () => {});

  // Detect unexpected tray process death and attempt restart
  psProcess.on("exit", (code) => {
    psProcess = null;
    
    // Reset counter if last crash was long ago
    const now = Date.now();
    if (now - lastTrayCrashTime > TRAY_RESTART_RESET_MS) trayRestartAttempts = 0;
    lastTrayCrashTime = now;

    if (!trayKilled && trayRestartAttempts < MAX_TRAY_RESTARTS) {
      trayRestartAttempts++;
      console.error(`[9router] tray exited unexpectedly (code: ${code}), restarting (${trayRestartAttempts}/${MAX_TRAY_RESTARTS})...`);
      setTimeout(() => {
        if (!psProcess) {
          try { initWinTray(options); } catch (e) { }
        }
      }, 3000);
    }
  });

  // Send initial menu items
  items.forEach((item, index) => {
    sendCommand({ action: "add-item", index, title: item.title, enabled: item.enabled });
  });

  return {
    updateItem(index, title, enabled) {
      sendCommand({ action: "update-item", index, title, enabled });
    },
    setTooltip(text) {
      sendCommand({ action: "set-tooltip", text });
    },
    kill() {
      trayKilled = true;
      try {
        sendCommand({ action: "kill" });
      } catch (e) {}
      setTimeout(() => {
        if (psProcess && !psProcess.killed) {
          try { psProcess.kill(); } catch (e) {}
        }
        psProcess = null;
      }, 300);
    }
  };
}

module.exports = { initWinTray };
