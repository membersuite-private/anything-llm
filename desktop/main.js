const { app, BrowserWindow, shell } = require("electron");
const path = require("path");
const { spawn } = require("child_process");

let mainWindow;
let serverProcess;
const SERVER_PORT = 3001;

function startServer() {
  const serverPath = path.join(__dirname, "..", "server");
  const env = {
    ...process.env,
    NODE_ENV: "production",
    STORAGE_DIR: path.join(serverPath, "storage"),
    SERVER_PORT: String(SERVER_PORT),
  };

  serverProcess = spawn("node", ["index.js"], {
    cwd: serverPath,
    env,
    stdio: "pipe",
  });

  serverProcess.stdout.on("data", (data) => {
    console.log(`[server] ${data}`);
  });

  serverProcess.stderr.on("data", (data) => {
    console.error(`[server] ${data}`);
  });

  return new Promise((resolve) => {
    // Wait for server to be ready
    const check = setInterval(async () => {
      try {
        const response = await fetch(`http://localhost:${SERVER_PORT}/api/ping`);
        if (response.ok) {
          clearInterval(check);
          resolve();
        }
      } catch {
        // Server not ready yet
      }
    }, 500);

    // Timeout after 30 seconds
    setTimeout(() => {
      clearInterval(check);
      resolve(); // Proceed anyway
    }, 30000);
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    title: "GrowthZone Intelligence",
    icon: path.join(__dirname, "icon.png"),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
    backgroundColor: "#1a1a2e",
    show: false,
  });

  mainWindow.loadURL(`http://localhost:${SERVER_PORT}`);

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });

  // Open external links in default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  console.log("Starting GrowthZone Intelligence server...");
  await startServer();
  console.log("Server ready. Opening window...");
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  if (serverProcess) {
    serverProcess.kill();
  }
});
