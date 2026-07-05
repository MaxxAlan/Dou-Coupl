import { useRef, useState, useCallback, useEffect } from 'react';
import { P2PChannel, P2PDataMessage, P2PStatus } from '../lib/p2pChannel';
import { apiClient } from '../lib/apiClient';

interface UseP2PChannelOptions {
  pairingCode: string;
  activePartner: 'A' | 'B';
  recipientId: 'A' | 'B';
  onMessage: (data: P2PDataMessage) => void;
  onStatusChange?: (status: P2PStatus) => void;
}

export function useP2PChannel({ pairingCode, activePartner, recipientId, onMessage, onStatusChange }: UseP2PChannelOptions) {
  const channelRef = useRef<P2PChannel | null>(null);
  const [status, setStatus] = useState<P2PStatus>('idle');
  const [isEnabled, setIsEnabled] = useState(false);

  const signalingCallback = useCallback(async (signal: any) => {
    try {
      await apiClient.post('/api/call/signal', { senderId: activePartner, recipientId, signal }, {
        'X-Pairing-Code': pairingCode
      });
    } catch (e) {
      console.error('[P2P] signaling error:', e);
    }
  }, [pairingCode, activePartner, recipientId]);

  const handleStatusChange = useCallback((s: P2PStatus) => {
    setStatus(s);
    onStatusChange?.(s);
  }, [onStatusChange]);

  const initChannel = useCallback(() => {
    if (channelRef.current) {
      channelRef.current.close();
    }
    const channel = new P2PChannel({
      signalingCallback,
      onMessage,
      onStatusChange: handleStatusChange,
    });
    channelRef.current = channel;
    return channel;
  }, [signalingCallback, onMessage, handleStatusChange]);

  const startHost = useCallback(async () => {
    const channel = initChannel();
    await channel.startHost();
  }, [initChannel]);

  const handleSignal = useCallback(async (signal: any) => {
    const channel = channelRef.current;
    if (!channel) return;
    if (signal.type === 'p2p_offer') {
      await channel.acceptOffer(signal);
    } else if (signal.type === 'p2p_answer') {
      await channel.handleAnswer(signal);
    } else if (signal.type === 'p2p_candidate') {
      await channel.handleCandidate(signal.candidate);
    }
  }, []);

  const sendText = useCallback((text: string) => {
    channelRef.current?.sendText(text, activePartner);
  }, [activePartner]);

  const sendImage = useCallback(async (base64Data: string) => {
    await channelRef.current?.sendImage(base64Data, activePartner);
  }, [activePartner]);

  const closeChannel = useCallback(() => {
    channelRef.current?.close();
    channelRef.current = null;
    setStatus('idle');
  }, []);

  useEffect(() => {
    return () => {
      closeChannel();
    };
  }, [closeChannel]);

  return {
    status,
    isEnabled,
    setIsEnabled,
    startHost,
    handleSignal,
    sendText,
    sendImage,
    closeChannel,
    channel: channelRef.current,
  };
}
