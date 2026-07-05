export type P2PMessageType = 'text' | 'image' | 'image_chunk' | 'voice' | 'presence' | 'file_info';

export interface P2PDataMessage {
  type: P2PMessageType;
  payload: any;
  senderId: 'A' | 'B';
  messageId: string;
  timestamp: number;
  totalChunks?: number;
  chunkIndex?: number;
  fileId?: string;
}

export type P2PStatus = 'idle' | 'host_waiting' | 'connecting' | 'connected' | 'disconnected' | 'error';

export type P2PEventHandler = (data: P2PDataMessage) => void;
export type P2PStatusHandler = (status: P2PStatus) => void;

const RTC_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ]
};

const CHUNK_SIZE = 16 * 1024;

export class P2PChannel {
  private pc: RTCPeerConnection | null = null;
  private dataChannel: RTCDataChannel | null = null;
  private onMessage: P2PEventHandler;
  private onStatusChange: P2PStatusHandler;
  private signalingCallback: (signal: any) => Promise<void>;
  private incomingChunks: Map<string, { chunks: string[]; total: number; meta: any }> = new Map();

  status: P2PStatus = 'idle';
  isHost: boolean = false;

  constructor(config: {
    signalingCallback: (signal: any) => Promise<void>;
    onMessage: P2PEventHandler;
    onStatusChange: P2PStatusHandler;
  }) {
    this.signalingCallback = config.signalingCallback;
    this.onMessage = config.onMessage;
    this.onStatusChange = config.onStatusChange;
  }

  private setStatus(status: P2PStatus) {
    this.status = status;
    this.onStatusChange(status);
  }

  async startHost() {
    this.isHost = true;
    this.setStatus('host_waiting');
    try {
      this.pc = new RTCPeerConnection(RTC_CONFIG);
      this.setupDataChannel(this.pc.createDataChannel('duo-p2p', { ordered: true }));
      this.setupPcHandlers(this.pc);

      const offer = await this.pc.createOffer();
      await this.pc.setLocalDescription(offer);
      await this.signalingCallback({ type: 'p2p_offer', sdp: offer.sdp, hostId: 'host' });
      this.setStatus('connecting');
    } catch (e) {
      console.error('[P2P] startHost error:', e);
      this.setStatus('error');
    }
  }

  async acceptOffer(offer: any) {
    this.isHost = false;
    this.setStatus('connecting');
    try {
      this.pc = new RTCPeerConnection(RTC_CONFIG);
      this.setupPcHandlers(this.pc);

      this.pc.ondatachannel = (event) => {
        this.setupDataChannel(event.channel);
      };

      await this.pc.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp: offer.sdp }));
      const answer = await this.pc.createAnswer();
      await this.pc.setLocalDescription(answer);
      await this.signalingCallback({ type: 'p2p_answer', sdp: answer.sdp });
    } catch (e) {
      console.error('[P2P] acceptOffer error:', e);
      this.setStatus('error');
    }
  }

  async handleAnswer(answer: any) {
    if (!this.pc) return;
    try {
      await this.pc.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: answer.sdp }));
    } catch (e) {
      console.error('[P2P] handleAnswer error:', e);
    }
  }

  async handleCandidate(candidate: any) {
    if (!this.pc) return;
    try {
      await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (e) {
      console.error('[P2P] handleCandidate error:', e);
    }
  }

  private setupDataChannel(channel: RTCDataChannel) {
    this.dataChannel = channel;

    channel.onopen = () => {
      this.setStatus('connected');
      this.send({ type: 'presence', payload: { status: 'online' }, senderId: '' as any, messageId: '', timestamp: Date.now() });
    };

    channel.onclose = () => {
      this.setStatus('disconnected');
    };

    channel.onerror = (e) => {
      console.error('[P2P] DataChannel error:', e);
      this.setStatus('error');
    };

    channel.onmessage = (event) => {
      try {
        const data: P2PDataMessage = JSON.parse(event.data);
        if (data.type === 'image_chunk') {
          this.handleChunk(data);
        } else {
          this.onMessage(data);
        }
      } catch (e) {
        console.error('[P2P] parse error:', e);
      }
    };
  }

  private setupPcHandlers(pc: RTCPeerConnection) {
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.signalingCallback({ type: 'p2p_candidate', candidate: event.candidate.toJSON() });
      }
    };

    pc.oniceconnectionstatechange = () => {
      const state = pc.iceConnectionState;
      if (state === 'disconnected' || state === 'failed' || state === 'closed') {
        this.setStatus('disconnected');
      } else if (state === 'connected') {
        this.setStatus('connected');
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
        this.setStatus('disconnected');
      }
    };
  }

  private handleChunk(data: P2PDataMessage) {
    const fileId = data.fileId || 'unknown';
    if (!this.incomingChunks.has(fileId)) {
      this.incomingChunks.set(fileId, { chunks: [], total: data.totalChunks || 1, meta: null });
    }
    const entry = this.incomingChunks.get(fileId)!;
    entry.chunks[data.chunkIndex || 0] = data.payload;
    if (entry.chunks.filter(Boolean).length === entry.total) {
      const assembled = entry.chunks.join('');
      this.incomingChunks.delete(fileId);
      this.onMessage({
        type: data.payload ? 'image' : 'image',
        payload: assembled,
        senderId: data.senderId,
        messageId: data.messageId,
        timestamp: data.timestamp
      });
    }
  }

  send(data: P2PDataMessage) {
    if (this.dataChannel?.readyState === 'open') {
      this.dataChannel.send(JSON.stringify(data));
    }
  }

  async sendText(text: string, senderId: 'A' | 'B') {
    this.send({
      type: 'text',
      payload: text,
      senderId,
      messageId: 'p2p-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
      timestamp: Date.now()
    });
  }

  async sendImage(base64Data: string, senderId: 'A' | 'B') {
    const messageId = 'p2p-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6);
    const totalChunks = Math.ceil(base64Data.length / CHUNK_SIZE);

    for (let i = 0; i < totalChunks; i++) {
      const chunk = base64Data.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
      this.send({
        type: 'image_chunk',
        payload: chunk,
        senderId,
        messageId,
        timestamp: Date.now(),
        totalChunks,
        chunkIndex: i,
        fileId: messageId
      });
    }
  }

  close() {
    if (this.dataChannel) {
      this.dataChannel.close();
      this.dataChannel = null;
    }
    if (this.pc) {
      this.pc.close();
      this.pc = null;
    }
    this.setStatus('disconnected');
  }
}
