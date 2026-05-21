/**
 * powershellBridge.js
 *
 * FIX #5: Auto-Restart mit exponential backoff bei Worker-Crash
 * FIX #5: Graceful Shutdown via SIGTERM
 * FIX #5: CMD_TIMEOUT auf 8s reduziert (war 15s)
 * FIX #5: Input-Size-Limit auf stdin (max 64KB pro Kommando)
 */

const { spawn }        = require("child_process");
const { EventEmitter } = require("events");
const path             = require("path");

const PS_SCRIPT    = path.join(__dirname, "../powershell/psWorker.ps1");
const POOL_SIZE    = parseInt(process.env.PS_POOL_SIZE    || "3",    10);
const CMD_TIMEOUT  = parseInt(process.env.PS_CMD_TIMEOUT  || "8000", 10);  // FIX: 8s statt 15s
const MAX_RESTARTS = parseInt(process.env.PS_MAX_RESTARTS || "5",    10);
const MAX_PAYLOAD  = 64 * 1024;  // 64KB – Input-Size-Limit

// ─── Session ─────────────────────────────────────────────────────────────────

class PsSession extends EventEmitter {
  constructor(id) {
    super();
    this.id            = id;
    this.busy          = false;
    this.ready         = false;
    this.process       = null;
    this._buffer       = "";
    this._resolve      = null;
    this._reject       = null;
    this._timer        = null;
    this._restartCount = 0;
    this._shuttingDown = false;
  }

  start() {
    return new Promise((resolve, reject) => {
      const exe = process.platform === "win32" ? "powershell.exe" : "pwsh";
      this.process = spawn(exe, [
        "-NoProfile", "-NonInteractive",
        "-ExecutionPolicy", "Bypass",
        "-File", PS_SCRIPT,
      ], { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });

      this.process.stdout.on("data", (chunk) => this._onData(chunk));
      this.process.stderr.on("data", (chunk) => {
        const msg = chunk.toString().trim();
        if (msg) console.error(`[PS-Worker-${this.id} stderr]`, msg);
      });

      // FIX #5: Exit-Handler mit Auto-Restart
      this.process.on("exit", (code) => {
        this.ready = false;
        if (this._reject) {
          this._reject(new Error(`PS-Worker-${this.id} beendet (exit ${code})`));
          this._resolve = null;
          this._reject  = null;
        }
        this.busy = false;

        if (!this._shuttingDown) {
          this._scheduleRestart();
        }
      });

      // Warten auf ##READY##
      const readyHandler = (data) => {
        if (data.includes("##READY##")) {
          this.removeListener("_raw", readyHandler);
          this.ready = true;
          this._restartCount = 0;  // Erfolgreicher Start: Counter zurücksetzen
          console.log(`[PS-Worker-${this.id}] Bereit`);
          resolve(this);
        }
      };
      this.on("_raw", readyHandler);

      setTimeout(() => {
        if (!this.ready) reject(new Error(`PS-Worker-${this.id} Start-Timeout`));
      }, 10000);
    });
  }

  // FIX #5: Exponential Backoff für Restarts
  _scheduleRestart() {
    if (this._restartCount >= MAX_RESTARTS) {
      console.error(`[PS-Worker-${this.id}] Max. Restarts (${MAX_RESTARTS}) erreicht. Worker deaktiviert.`);
      this.emit("dead");
      return;
    }
    const delay = Math.min(1000 * Math.pow(2, this._restartCount), 30000);
    this._restartCount++;
    console.warn(`[PS-Worker-${this.id}] Neustart in ${delay}ms (Versuch ${this._restartCount}/${MAX_RESTARTS})`);
    setTimeout(() => {
      this._buffer = "";
      this.start().catch((err) => {
        console.error(`[PS-Worker-${this.id}] Neustart fehlgeschlagen:`, err.message);
        this._scheduleRestart();
      });
    }, delay);
  }

  _onData(chunk) {
    this._buffer += chunk.toString();
    this.emit("_raw", this._buffer);

    if (this._buffer.includes("##END##")) {
      const raw = this._buffer
        .split("##END##")[0]
        .replace("##READY##", "")  // READY-Signal aus Buffer entfernen
        .trim();
      this._buffer = "";
      clearTimeout(this._timer);

      if (this._resolve) {
        try {
          const parsed = JSON.parse(raw);
          this._resolve(parsed);
        } catch (e) {
          this._reject(new Error("PS-Bridge JSON-Fehler: " + raw.slice(0, 200)));
        }
        this._resolve = null;
        this._reject  = null;
      }
      this.busy = false;
      this.emit("free");
    }
  }

  exec(payload) {
    // FIX #5: Input-Size-Limit
    const serialized = JSON.stringify(payload);
    if (serialized.length > MAX_PAYLOAD) {
      return Promise.reject(new Error(`PS-Payload zu groß: ${serialized.length} Bytes (max ${MAX_PAYLOAD})`));
    }

    return new Promise((resolve, reject) => {
      this.busy     = true;
      this._resolve = resolve;
      this._reject  = reject;

      this._timer = setTimeout(() => {
        this.busy = false;
        this._resolve = null;
        this._reject  = null;
        reject(new Error(`PS-Kommando Timeout (${CMD_TIMEOUT}ms): ${payload.cmd}`));
      }, CMD_TIMEOUT);

      this.process.stdin.write(serialized + "\n");
    });
  }

  kill() {
    this._shuttingDown = true;
    if (this.process) {
      try { this.process.stdin.end(); } catch {}
      this.process.kill("SIGTERM");
    }
  }
}

// ─── Pool ─────────────────────────────────────────────────────────────────────

class PsPool {
  constructor() {
    this.sessions     = [];
    this.queue        = [];
    this._initialized = false;
  }

  async init() {
    if (this._initialized) return;
    this._initialized = true;

    for (let i = 0; i < POOL_SIZE; i++) {
      try {
        const s = new PsSession(i + 1);
        await s.start();
        s.on("free", () => this._drain());
        s.on("dead", () => console.error(`[PS-Pool] Worker ${i + 1} permanent ausgefallen.`));
        this.sessions.push(s);
      } catch (err) {
        console.error(`[PS-Pool] Worker ${i + 1} konnte nicht gestartet werden:`, err.message);
      }
    }

    if (this.sessions.length === 0) {
      throw new Error("Kein PS-Worker gestartet. RSAT installiert? PowerShell verfügbar?");
    }
  }

  _getFreeSession() {
    return this.sessions.find(s => s.ready && !s.busy);
  }

  _drain() {
    if (this.queue.length === 0) return;
    const session = this._getFreeSession();
    if (!session) return;
    const { payload, resolve, reject } = this.queue.shift();
    session.exec(payload).then(resolve).catch(reject);
  }

  run(cmd, params = {}, credential = null) {
    const payload = { cmd, params, credential };
    const session = this._getFreeSession();
    if (session) return session.exec(payload);
    return new Promise((resolve, reject) => {
      this.queue.push({ payload, resolve, reject });
    });
  }

  // FIX #5: Graceful Shutdown
  shutdown() {
    console.log("[PS-Pool] Shutdown – alle Worker werden beendet...");
    this.sessions.forEach(s => s.kill());
  }

  status() {
    return this.sessions.map(s => ({
      id:    s.id,
      ready: s.ready,
      busy:  s.busy,
      restarts: s._restartCount,
    }));
  }
}

const pool = new PsPool();
let initPromise = null;
async function getPool() {
  if (!initPromise) initPromise = pool.init();
  await initPromise;
  return pool;
}

// FIX #5: SIGTERM-Handler für Graceful Shutdown
process.on("SIGTERM", () => {
  console.log("[Server] SIGTERM empfangen – fahre herunter...");
  pool.shutdown();
});
process.on("SIGINT", () => {
  pool.shutdown();
  process.exit(0);
});

module.exports = { getPool, getPoolStatus: () => pool.status() };