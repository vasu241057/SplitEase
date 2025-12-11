import { useEffect, useRef, useState } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { X } from 'lucide-react';
import { Button } from './ui/button';

interface QRScannerProps {
  onScanSuccess: (decodedText: string) => void;
  onClose: () => void;
}

export function QRScanner({ onScanSuccess, onClose }: QRScannerProps) {
  const scannerRef = useRef<Html5QrcodeScanner | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Initialize scanner
    // Use a slight delay to ensure DOM is ready
    const timer = setTimeout(() => {
        try {
            const scanner = new Html5QrcodeScanner(
                "reader",
                { 
                    fps: 10, 
                    qrbox: { width: 250, height: 250 },
                    aspectRatio: 1.0
                },
                /* verbose= */ false
            );
        
            scanner.render(
                (decodedText) => {
                    // Success callback
                    scanner.clear();
                    onScanSuccess(decodedText);
                },
                (_errorMessage) => {
                    // Error callback (called frequently, usually ignore)
                    // console.log(errorMessage); 
                }
            );
            scannerRef.current = scanner;
        } catch (err: any) {
            console.error("Failed to start scanner", err);
            setError("Could not start camera. Please check permissions.");
        }
    }, 100);

    return () => {
        clearTimeout(timer);
        if (scannerRef.current) {
            scannerRef.current.clear().catch(err => console.error("Failed to clear scanner", err));
        }
    };
  }, [onScanSuccess]);

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      <div className="flex items-center justify-between p-4 border-b">
        <h2 className="text-xl font-bold">Scan Invite Code</h2>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-6 w-6" />
        </Button>
      </div>
      
      <div className="flex-1 flex flex-col items-center justify-center p-4">
         {error ? (
             <div className="text-center space-y-4">
                 <p className="text-red-500">{error}</p>
                 <Button onClick={onClose}>Close</Button>
             </div>
         ) : (
             <div id="reader" className="w-full max-w-sm overflow-hidden rounded-lg border bg-black"></div>
         )}
         <p className="mt-6 text-center text-muted-foreground text-sm">
            Point your camera at a SplitEase Friend Invite QR Code
         </p>
      </div>
    </div>
  );
}
