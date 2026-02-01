import { useEffect, useRef, useState, useCallback } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { X, Loader2, Camera, Image, ArrowLeft } from 'lucide-react';
import { Button } from './ui/button';

interface QRScannerProps {
  onScanSuccess: (decodedText: string) => void;
  onClose: () => void;
}

type ScanMode = 'choose' | 'camera' | 'gallery';

export function QRScanner({ onScanSuccess, onClose }: QRScannerProps) {
  const [mode, setMode] = useState<ScanMode>('choose');
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [processing, setProcessing] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const startCameraScanner = useCallback(async () => {
    setStarting(true);
    setError(null);
    
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
          html5QrCode.stop().then(() => {
            onScanSuccess(decodedText);
          }).catch(err => {
            console.error("Failed to stop scanner", err);
            onScanSuccess(decodedText);
          });
        },
        () => {
          // Ignore frame parse errors
        }
      );
      setStarting(false);
    } catch (err: any) {
      console.error("Failed to start scanner", err);
      setError("Could not access camera. Please check permissions.");
      setStarting(false);
    }
  }, [onScanSuccess]);

  useEffect(() => {
    if (mode === 'camera') {
      const timer = setTimeout(startCameraScanner, 100);
      return () => {
        clearTimeout(timer);
        if (scannerRef.current && scannerRef.current.isScanning) {
          scannerRef.current.stop().catch(err => console.error("Failed to stop scanner on unmount", err));
        }
      };
    }
  }, [mode, startCameraScanner]);

  const handleGallerySelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setProcessing(true);
    setError(null);

    try {
      const html5QrCode = new Html5Qrcode("gallery-reader", { verbose: false });
      const result = await html5QrCode.scanFile(file, true);
      html5QrCode.clear();
      onScanSuccess(result);
    } catch (err: any) {
      console.error("Failed to scan image", err);
      setError("No QR code found in the image. Please try another image.");
      setProcessing(false);
    }
  };

  const handleBack = () => {
    if (mode === 'choose') {
      onClose();
    } else {
      if (scannerRef.current && scannerRef.current.isScanning) {
        scannerRef.current.stop().catch(console.error);
      }
      setMode('choose');
      setError(null);
    }
  };

  // Mode selection screen
  if (mode === 'choose') {
    return (
      <div className="fixed inset-0 z-50 bg-background flex flex-col">
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={onClose}>
              <ArrowLeft className="h-6 w-6" />
            </Button>
            <h2 className="text-xl font-bold">Scan QR Code</h2>
          </div>
        </div>
        
        <div className="flex-1 flex flex-col items-center justify-center p-6 gap-8">
          <div className="text-center space-y-2">
            <h3 className="text-2xl font-bold">Add Friend via QR</h3>
            <p className="text-muted-foreground">
              Scan your friend's QR code to add them
            </p>
          </div>

          <div className="w-full max-w-sm space-y-4">
            <Button 
              size="lg" 
              className="w-full h-16 gap-4 text-lg" 
              onClick={() => setMode('camera')}
            >
              <Camera className="h-6 w-6" />
              Scan with Camera
            </Button>
            
            <Button 
              size="lg" 
              variant="outline"
              className="w-full h-16 gap-4 text-lg" 
              onClick={() => fileInputRef.current?.click()}
            >
              <Image className="h-6 w-6" />
              Choose from Gallery
            </Button>
            
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleGallerySelect}
            />
          </div>

          {processing && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span>Processing image...</span>
            </div>
          )}

          {error && (
            <div className="bg-destructive/10 text-destructive px-4 py-3 rounded-lg max-w-sm text-center">
              {error}
            </div>
          )}
        </div>

        {/* Hidden div for gallery scanner */}
        <div id="gallery-reader" className="hidden" />
      </div>
    );
  }

  // Camera scanning screen
  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col text-white">
      <div className="flex items-center justify-between p-4 border-b border-white/10 bg-black">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={handleBack} className="text-white hover:bg-white/10">
            <ArrowLeft className="h-6 w-6" />
          </Button>
          <h2 className="text-xl font-bold">Scan QR Code</h2>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} className="text-white hover:bg-white/10">
          <X className="h-6 w-6" />
        </Button>
      </div>
      
      <div className="flex-1 flex flex-col items-center justify-center p-4 relative">
         {error ? (
             <div className="text-center space-y-4 max-w-xs">
                 <p className="text-red-400 font-medium">{error}</p>
                 <Button variant="secondary" onClick={handleBack}>Go Back</Button>
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
