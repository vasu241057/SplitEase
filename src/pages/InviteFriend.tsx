import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Share2, Copy, Check } from 'lucide-react';
import QRCode from 'react-qr-code';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { api } from '../utils/api';
// import { useAuth } from '../context/AuthContext';

export function InviteFriend() {
  const navigate = useNavigate();
  // const { user } = useAuth();
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        <div className="text-center space-y-2">
          <h2 className="text-2xl font-bold">Scan to Add</h2>
          <p className="text-muted-foreground">
            Show this QR code to your friend
          </p>
          {error && (
            <p className="text-red-500 text-sm bg-red-50 p-2 rounded">
              Error: {error}
            </p>
          )}
        </div>

        <Card className="p-8 bg-white rounded-3xl shadow-lg">
          {inviteCode ? (
            <QRCode value={inviteUrl} size={200} />
          ) : (
            <div className="h-[200px] w-[200px] bg-muted animate-pulse rounded-lg" />
          )}
        </Card>

        {/* How to scan instructions */}
        <div className="bg-muted/50 rounded-xl p-4 max-w-sm text-center space-y-2">
          <p className="text-sm font-medium">How your friend scans this:</p>
          <div className="text-xs text-muted-foreground space-y-1">
            <p>1. Open SplitEase on their phone</p>
            <p>2. Go to <span className="font-semibold text-foreground">Settings → Scan Invite Code</span></p>
            <p>3. Point camera at this QR</p>
          </div>
        </div>


        <div className="w-full max-w-sm space-y-4">
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">
                Or share link
              </span>
            </div>
          </div>

          <Button size="lg" className="w-full gap-2" onClick={handleShare}>
            <Share2 className="h-5 w-5" />
            Share Invite Link
          </Button>

          <Button variant="outline" size="lg" className="w-full gap-2" onClick={handleCopy}>
            {copied ? <Check className="h-5 w-5 text-green-600" /> : <Copy className="h-5 w-5" />}
            {copied ? 'Copied!' : 'Copy Link'}
          </Button>
        </div>
      </div>
    </div>
  );
}
