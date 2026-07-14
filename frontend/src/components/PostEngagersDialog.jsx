import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Users, Loader2, BadgeCheck, ExternalLink } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from './ui/table';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import api from '../lib/api';
import { toast } from 'sonner';
import { FrequencyBadge } from './FrequentEngagersDialog';

const POLL_MS = 4000;

/**
 * Frequent Engagers for a single alert's post — fetches retweeters of just
 * that one tweet (not the author's whole timeline). The frequency badge on
 * each retweeter still reflects that account's engagement across every post
 * of this handle analyzed so far (this post plus any prior ones), since the
 * backend folds each post-scoped run into the same per-handle history used
 * by full-profile scans.
 */
export const PostEngagersDialog = ({ open, onOpenChange, alertId }) => {
  const [phase, setPhase] = useState('loading'); // loading | processing | ready | blocked | error
  const [message, setMessage] = useState('');
  const [handle, setHandle] = useState(null);
  const [tweetId, setTweetId] = useState(null);
  const [detail, setDetail] = useState(null);
  const pollRef = useRef(null);

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const fetchDetail = useCallback(async (h) => {
    try {
      const res = await api.get('/engager/engager-analysis/latest', { params: { handle: h } });
      setDetail(res.data);
      if (res.data?.status !== 'processing') {
        stopPolling();
        setPhase(res.data?.status === 'failed' ? 'error' : 'ready');
        if (res.data?.status === 'failed') setMessage(res.data?.error || 'Analysis failed');
      }
    } catch (error) {
      stopPolling();
      setPhase('error');
      setMessage('Failed to load analysis results');
    }
  }, []);

  useEffect(() => {
    if (!open || !alertId) return;

    setPhase('loading');
    setMessage('');
    setDetail(null);
    setHandle(null);
    setTweetId(null);

    (async () => {
      try {
        const res = await api.post('/engager/engager-analysis/post', { alert_id: alertId });
        const data = res.data;
        setTweetId(data.tweet_id || null);

        if (data.status === 'started' || data.status === 'already_processing') {
          setHandle(data.handle);
          setPhase('processing');
          await fetchDetail(data.handle);
          pollRef.current = setInterval(() => fetchDetail(data.handle), POLL_MS);
        } else if (data.status === 'blocked') {
          setPhase('blocked');
          setMessage(data.message);
          toast.warning(data.message);
        } else {
          setPhase('error');
          setMessage(data.message || 'Could not start analysis');
        }
      } catch (error) {
        setPhase('error');
        setMessage(error.response?.data?.message || 'Failed to start analysis');
      }
    })();

    return () => stopPolling();
  }, [open, alertId, fetchDetail]);

  const tweetSnapshot = detail?.tweets?.find((t) => t.id === tweetId) || null;
  const retweeters = tweetId
    ? (detail?.engagers || []).filter((e) => (e.tweet_ids || []).includes(tweetId))
    : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" /> Frequent Engagers — This Post
          </DialogTitle>
        </DialogHeader>

        {tweetSnapshot?.url && (
          <a
            href={tweetSnapshot.url}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-muted-foreground hover:text-primary hover:underline flex items-center gap-1 -mt-2"
          >
            View original post <ExternalLink className="h-3 w-3" />
          </a>
        )}

        {(phase === 'loading' || phase === 'processing') && (
          <div className="flex-1 flex flex-col items-center justify-center gap-2 text-muted-foreground text-sm py-10">
            <Loader2 className="h-5 w-5 animate-spin" />
            {phase === 'loading' ? 'Starting analysis...' : `Fetching retweeters${handle ? ` for @${handle}` : ''}...`}
          </div>
        )}

        {phase === 'blocked' && (
          <div className="flex-1 flex items-center justify-center text-center text-sm text-amber-700 py-10 px-4">
            {message}
          </div>
        )}

        {phase === 'error' && (
          <div className="flex-1 flex items-center justify-center text-center text-sm text-red-600 py-10 px-4">
            {message}
          </div>
        )}

        {phase === 'ready' && (
          <>
            <div className="grid grid-cols-2 gap-2 text-center">
              <div className="rounded-md border p-2">
                <div className="text-lg font-bold">{retweeters.length}</div>
                <div className="text-[10px] text-muted-foreground">Retweeted This Post</div>
              </div>
              <div className="rounded-md border p-2">
                <div className="text-lg font-bold">{retweeters.filter((e) => e.frequency === 'super-active' || e.frequency === 'regular').length}</div>
                <div className="text-[10px] text-muted-foreground">Frequent Amplifiers</div>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Engager</TableHead>
                    <TableHead className="text-right">Retweets of @{handle}</TableHead>
                    <TableHead>Frequency</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {retweeters.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center text-xs text-muted-foreground py-6">
                        No retweeters found for this post yet.
                      </TableCell>
                    </TableRow>
                  )}
                  {retweeters.map((e) => (
                    <TableRow key={e.handle}>
                      <TableCell>
                        <a href={`https://x.com/${e.handle}`} target="_blank" rel="noreferrer" className="flex items-center gap-2 hover:underline">
                          <Avatar className="h-6 w-6"><AvatarImage src={e.avatar} /><AvatarFallback>{e.handle[0]?.toUpperCase()}</AvatarFallback></Avatar>
                          <span className="text-xs font-medium">@{e.handle}</span>
                          {e.verified && <BadgeCheck className="h-3.5 w-3.5 text-sky-500" />}
                        </a>
                      </TableCell>
                      <TableCell className="text-right text-xs font-semibold">{e.tweets_retweeted}</TableCell>
                      <TableCell><FrequencyBadge frequency={e.frequency} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default PostEngagersDialog;
