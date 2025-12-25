import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { UserPlus, X } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '../components/ui/avatar';
import { Card } from '../components/ui/card';
import { api } from '../utils/api';
import { useAuth } from '../context/AuthContext';

export function AcceptInvite() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [sender, setSender] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);

  useEffect(() => {
    const fetchInvite = async () => {
      try {
        // If not logged in, we should probably redirect to login with return URL
        // But for now let's assume public endpoint can fetch basic info?
        // Actually, our backend route /invite/:code is public (no authMiddleware).
        const data = await api.get(`/api/user/invite/${code}`);
        setSender(data);
      } catch (_err) {
        setError('Invalid or expired invite link.');
      } finally {
        setLoading(false);
      }
    };
    
    if (code) fetchInvite();
  }, [code]);

  const handleAccept = async () => {
    if (!user) {
      // Redirect to login/signup, passing the invite URL as 'from' state or query param
      navigate('/login', { state: { from: `/invite/${code}` } });
      return;
    }

    setAccepting(true);
    try {
      await api.post('/api/friends/accept-invite', { inviteCode: code });
      navigate('/friends');
    } catch (err: any) {
      setError(err.message || 'Failed to accept invite');
    } finally {
      setAccepting(false);
    }
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4 text-center space-y-4">
        <div className="h-12 w-12 rounded-full bg-red-100 flex items-center justify-center text-red-600">
          <X className="h-6 w-6" />
        </div>
        <h1 className="text-xl font-bold">Oops!</h1>
        <p className="text-muted-foreground">{error}</p>
        <Button onClick={() => navigate('/')}>Go Home</Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      <Card className="w-full max-w-md p-8 space-y-8 text-center">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold">Friend Request</h1>
          <p className="text-muted-foreground">
            {sender.full_name} wants to add you on SplitEase
          </p>
        </div>

        <div className="flex justify-center">
          <Avatar className="h-24 w-24 border-4 border-background shadow-xl">
            <AvatarImage src={sender.avatar_url} />
            <AvatarFallback className="text-2xl">{sender.full_name?.[0]}</AvatarFallback>
          </Avatar>
        </div>

        <div className="space-y-4">
          <Button size="lg" className="w-full gap-2" onClick={handleAccept} disabled={accepting}>
            {accepting ? 'Adding...' : (
              <>
                <UserPlus className="h-5 w-5" />
                Add {sender.full_name}
              </>
            )}
          </Button>
          
          <Button variant="ghost" className="w-full" onClick={() => navigate('/')}>
            Cancel
          </Button>
        </div>
      </Card>
    </div>
  );
}
