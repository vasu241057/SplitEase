export interface LogEntry {
  timestamp: string;
  level: 'log' | 'warn' | 'error' | 'info';
  message: string;
}

const MAX_LOGS = 100;
const LOG_STORAGE_KEY = 'splitease_debug_logs';

class DebugLogger {
  private logs: LogEntry[] = [];
  private listeners: ((logs: LogEntry[]) => void)[] = [];
  private originalConsole = {
    log: console.log,
    warn: console.warn,
    error: console.error,
    info: console.info,
  };

  constructor() {
    // Load persisted logs from previous session if any
    try {
      const stored = sessionStorage.getItem(LOG_STORAGE_KEY);
      if (stored) {
        this.logs = JSON.parse(stored);
      }
    } catch (e) {
      // ignore
    }

    this.init();
  }

  private init() {
    // Monkey patch console methods
    console.log = (...args) => {
      this.originalConsole.log(...args);
      this.addLog('log', args);
    };
    console.warn = (...args) => {
      this.originalConsole.warn(...args);
      this.addLog('warn', args);
    };
    console.error = (...args) => {
      this.originalConsole.error(...args);
      this.addLog('error', args);
    };
    console.info = (...args) => {
      this.originalConsole.info(...args);
      this.addLog('info', args);
    };
  }

  private addLog(level: LogEntry['level'], args: any[]) {
    const message = args.map(arg => {
      if (typeof arg === 'object') {
        try {
          return JSON.stringify(arg);
        } catch (e) {
          return String(arg);
        }
      }
      return String(arg);
    }).join(' ');

    const entry: LogEntry = {
      timestamp: new Date().toISOString().split('T')[1].slice(0, -1), // HH:mm:ss.ms
      level,
      message
    };

    this.logs = [entry, ...this.logs].slice(0, MAX_LOGS);
    
    // Persist to session storage so we survive reloads
    try {
        sessionStorage.setItem(LOG_STORAGE_KEY, JSON.stringify(this.logs));
    } catch (e) {
        // ignore
    }

    this.notifyListeners();
  }

  public getLogs() {
    return this.logs;
  }

  public clearLogs() {
    this.logs = [];
    sessionStorage.removeItem(LOG_STORAGE_KEY);
    this.notifyListeners();
  }

  public subscribe(listener: (logs: LogEntry[]) => void) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private notifyListeners() {
    this.listeners.forEach(listener => listener(this.logs));
  }
}

export const debugLogger = new DebugLogger();
