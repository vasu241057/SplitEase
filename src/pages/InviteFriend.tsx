import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Share2, Copy, Check, QrCode, Loader2, X } from 'lucide-react';
import QRCode from 'react-qr-code';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { api } from '../utils/api';
import { QRScanner } from '../components/QRScanner';

export function InviteFriend() {
  const navigate = useNavigate();
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showScanner, setShowScanner] = useState(false);
  const [scanStatus, setScanStatus] = useState<"idle" | "processing" | "success" | "error">("idle");
  const [scanMessage, setScanMessage] = useState("");

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const profile = await api.get('/api/user/profile');
        setInviteCode(profile.invite_code);
      } catch (error: any) {
        console.error('Failed to fetch profile:', error);
        setError(error.message || 'Failed to load profile');
      }
    };
    fetchProfile();
  }, []);

  const inviteUrl = inviteCode ? `${window.location.origin}/invite/${inviteCode}` : '';

  const handleShare = async () => {
    if (navigator.share && inviteUrl) {
      try {
        await navigator.share({
          title: 'Join me on SplitEase',
          text: 'Join me on SplitEase to split expenses easily!',
          url: inviteUrl,
        });
      } catch (err) {
        console.error('Error sharing:', err);
      }
    } else {
      handleCopy();
    }
  };

  const handleCopy = async () => {
    if (inviteUrl) {
      try {
        await navigator.clipboard.writeText(inviteUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch (err) {
        console.error('Failed to copy:', err);
      }
    }
  };

  const handleScanSuccess = async (decodedText: string) => {
    setShowScanner(false);
    setScanStatus("processing");
    
    try {
      let inviteCode = decodedText;
      if (decodedText.includes('/invite/')) {
        const parts = decodedText.split('/invite/');
        if (parts.length > 1) inviteCode = parts[1];
      }
      
      const res = await api.post('/api/friends/accept-invite', { inviteCode });
      if (res) {
        setScanStatus("success");
        setScanMessage(`Successfully added friend: ${res.friend.name || 'Unknown'}`);
      }
    } catch (error: any) {
      console.error("Failed to accept invite", error);
      setScanStatus("error");
      setScanMessage("Failed to accept invite: " + (error.response?.data?.error || error.message));
    }
  };

  const closeScanResult = () => {
    setScanStatus("idle");
    setScanMessage("");
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <div className="p-4 flex items-center gap-4 border-b">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-6 w-6" />
        </Button>
        <h1 className="text-xl font-bold">Add Friend</h1>
      </div>

      <div className="flex-1 flex flex-col items-center pt-4 p-6 space-y-6">
        {/* Scan their QR - Primary Action */}
        <div className="w-full max-w-sm">
          <Button 
            size="lg" 
            className="w-full h-14 gap-3 text-base"
            onClick={() => setShowScanner(true)}
          >
            <QrCode className="h-5 w-5" />
            Scan Friend's QR Code
          </Button>
          <p className="text-xs text-muted-foreground text-center mt-2">
            Scan from camera or upload a screenshot
          </p>
        </div>

        {/* Divider */}
        <div className="w-full max-w-sm relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-background px-2 text-muted-foreground">
              or share your code
            </span>
          </div>
        </div>

        {/* Your QR Code */}
        <div className="text-center space-y-2">
          <h2 className="text-lg font-semibold">Your QR Code</h2>
          <p className="text-sm text-muted-foreground">
            Ask your friend to scan this
          </p>
          {error && (
            <p className="text-red-500 text-sm bg-red-50 p-2 rounded">
              Error: {error}
            </p>
          )}
        </div>

        <Card className="p-6 bg-white rounded-2xl shadow-lg">
          {inviteCode ? (
            <QRCode value={inviteUrl} size={180} />
          ) : (
            <div className="h-[180px] w-[180px] bg-muted animate-pulse rounded-lg" />
          )}
        </Card>

        {/* Share buttons */}
        <div className="w-full max-w-sm space-y-3">
          <Button size="lg" variant="outline" className="w-full gap-2" onClick={handleShare}>
            <Share2 className="h-5 w-5" />
            Share Invite Link
          </Button>

          <Button variant="ghost" size="sm" className="w-full gap-2" onClick={handleCopy}>
            {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
            {copied ? 'Copied!' : 'Copy Link'}
          </Button>
        </div>
      </div>

      {/* QR Scanner */}
      {showScanner && (
        <QRScanner 
          onScanSuccess={handleScanSuccess} 
          onClose={() => setShowScanner(false)} 
        />
      )}

      {/* Result Modal */}
      {scanStatus !== 'idle' && (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
          <Card className="max-w-xs w-full p-6 flex flex-col items-center gap-4 text-center animate-in fade-in zoom-in-95 duration-200">
            {scanStatus === 'processing' && (
              <>
                <Loader2 className="h-10 w-10 animate-spin text-primary" />
                <p className="font-medium">Processing Invite...</p>
              </>
            )}
            {scanStatus === 'success' && (
              <>
                <div className="h-12 w-12 rounded-full bg-green-100 flex items-center justify-center">
                  <Check className="h-6 w-6 text-green-600" />
                </div>
                <div className="space-y-1">
                  <h3 className="font-bold text-lg">Success!</h3>
                  <p className="text-sm text-muted-foreground">{scanMessage}</p>
                </div>
                <Button className="w-full" onClick={closeScanResult}>Done</Button>
              </>
            )}
            {scanStatus === 'error' && (
              <>
                <div className="h-12 w-12 rounded-full bg-red-100 flex items-center justify-center">
                  <X className="h-6 w-6 text-red-600" />
                </div>
                <div className="space-y-1">
                  <h3 className="font-bold text-lg">Error</h3>
                  <p className="text-sm text-muted-foreground">{scanMessage}</p>
                </div>
                <Button variant="outline" className="w-full" onClick={closeScanResult}>Close</Button>
              </>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
