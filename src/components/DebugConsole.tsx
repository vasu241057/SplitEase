import { useEffect, useState } from 'react';
import { debugLogger, type LogEntry } from '../utils/debugLogger';

export function DebugConsole() {
  const [logs, setLogs] = useState<LogEntry[]>(() => debugLogger.getLogs());
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    return debugLogger.subscribe(setLogs);
  }, []);

  if (!isOpen) {
    return (
      <button 
        onClick={() => setIsOpen(true)}
        className="fixed bottom-20 right-4 z-[9999] bg-red-600 text-white px-3 py-1 rounded-full text-xs shadow-lg opacity-80"
      >
        Debug Logs
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-[9999] bg-black/90 text-green-400 font-mono text-xs flex flex-col pointer-events-auto">
      <div className="flex justify-between items-center p-2 border-b border-green-800 bg-black">
        <h3 className="font-bold">Console Logs</h3>
        <div className="flex gap-2">
            <button 
                onClick={() => debugLogger.clearLogs()}
                className="px-2 py-1 bg-yellow-900 rounded text-yellow-100"
            >
                Clear
            </button>
            <button 
                onClick={() => setIsOpen(false)}
                className="px-2 py-1 bg-gray-800 rounded text-white"
            >
                Close
            </button>
        </div>
      </div>
      <div className="flex-1 overflow-auto p-2 space-y-1">
        {logs.map((log, i) => (
          <div key={i} className={`border-b border-gray-800 pb-1 ${
            log.level === 'error' ? 'text-red-400' : 
            log.level === 'warn' ? 'text-yellow-400' : 'text-green-400'
          }`}>
            <span className="text-gray-500 mr-2">[{log.timestamp}]</span>
            <span className="uppercase text-[10px] mr-1 opacity-70">{log.level}</span>
            <span className="break-all whitespace-pre-wrap">{log.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
