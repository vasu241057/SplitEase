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

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const profile = await api.get('/api/user/profile');
        setInviteCode(profile.invite_code);
      } catch (error) {
        console.error('Failed to fetch profile:', error);
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
          text: 'Let\'s split expenses easily! Add me as a friend:',
          url: inviteUrl,
        });
      } catch (error) {
        console.error('Error sharing:', error);
      }
    } else {
      handleCopy();
    }
  };

  const handleCopy = () => {
    if (inviteUrl) {
      navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
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

      <div className="flex-1 flex flex-col items-center justify-center p-6 space-y-8">
        <div className="text-center space-y-2">
          <h2 className="text-2xl font-bold">Scan to Add</h2>
          <p className="text-muted-foreground">
            Ask your friend to scan this code to add you instantly.
          </p>
        </div>

        <Card className="p-8 bg-white rounded-3xl shadow-lg">
          {inviteCode ? (
            <QRCode value={inviteUrl} size={200} />
          ) : (
            <div className="h-[200px] w-[200px] bg-muted animate-pulse rounded-lg" />
          )}
        </Card>

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
