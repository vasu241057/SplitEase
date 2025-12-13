import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { X, Loader2 } from 'lucide-react';
import { Button } from './ui/button';

interface QRScannerProps {
  onScanSuccess: (decodedText: string) => void;
  onClose: () => void;
}

export function QRScanner({ onScanSuccess, onClose }: QRScannerProps) {
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(true);
  const scannerRef = useRef<Html5Qrcode | null>(null);

  useEffect(() => {
    // Initialize scanner
    const startScanner = async () => {
        try {
            const html5QrCode = new Html5Qrcode("reader");
            scannerRef.current = html5QrCode;

            await html5QrCode.start(
                { facingMode: "environment" }, 
                {
                    fps: 10,
                    qrbox: { width: 250, height: 250 },
                    aspectRatio: 1.0,
                },
                (decodedText) => {
                    // Success callback
                    // Stop scanning immediately to prevent duplicate reads
                     html5QrCode.stop().then(() => {
                        onScanSuccess(decodedText);
                     }).catch(err => {
                         console.error("Failed to stop scanner", err);
                         onScanSuccess(decodedText); // Proceed anyway
                     });
                },
                (_errorMessage) => {
                    // Ignore frame parse errors
                }
            );
            setStarting(false);
        } catch (err: any) {
            console.error("Failed to start scanner", err);
            setError("Could not access camera. Please check permissions / secure context (HTTPS).");
            setStarting(false);
        }
    };

    // Small delay to ensure DOM is ready
    const timer = setTimeout(startScanner, 100);

    return () => {
        clearTimeout(timer);
        if (scannerRef.current && scannerRef.current.isScanning) {
            scannerRef.current.stop().catch(err => console.error("Failed to stop scanner on unmount", err));
        }
    };
  }, [onScanSuccess]);

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col text-white">
      <div className="flex items-center justify-between p-4 border-b border-white/10 bg-black">
        <h2 className="text-xl font-bold">Scan Invite Code</h2>
        <Button variant="ghost" size="icon" onClick={onClose} className="text-white hover:bg-white/10">
          <X className="h-6 w-6" />
        </Button>
      </div>
      
      <div className="flex-1 flex flex-col items-center justify-center p-4 relative">
         {error ? (
             <div className="text-center space-y-4 max-w-xs">
                 <p className="text-red-400 font-medium">{error}</p>
                 <Button variant="secondary" onClick={onClose}>Close</Button>
             </div>
         ) : (
             <>
                <div id="reader" className="w-full max-w-sm overflow-hidden rounded-lg bg-black relative">
                    {/* The library injects video here */}
                </div>
                {starting && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-10">
                        <Loader2 className="h-8 w-8 animate-spin text-white" />
                    </div>
                )}
             </>
         )}
         {!error && !starting && (
             <p className="mt-8 text-center text-white/70 text-sm">
                Point your camera at a SplitEase Friend Invite QR Code
             </p>
         )}
      </div>
    </div>
  );
}
