import React, { useEffect, useRef, useState } from 'react';
import { Phone, PhoneOff, Video, VideoOff, Mic, MicOff, Disc, Download, Upload, Shield } from 'lucide-react';
import { apiClient } from '../lib/apiClient';

interface CallOverlayProps {
  pairingCode: string;
  activePartner: 'A' | 'B';
  recipientId: 'A' | 'B';
  recipientName: string;
  recipientAvatar: string;
  callType: 'voice' | 'video';
  incomingSignal?: any; // Offer if incoming
  isIncoming: boolean;
  onClose: () => void;
  onSaveToAlbum: (base64Data: string, type: 'video' | 'voice') => void;
}

export default function CallOverlay({
  pairingCode,
  activePartner,
  recipientId,
  recipientName,
  recipientAvatar,
  callType,
  incomingSignal,
  isIncoming,
  onClose,
  onSaveToAlbum
}: CallOverlayProps) {
  const [callState, setCallState] = useState<'dialing' | 'ringing' | 'connected' | 'ended'>('dialing');
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [isVideoMuted, setIsVideoMuted] = useState(callType === 'voice');
  
  // Recording states
  const [isRecording, setIsRecording] = useState(false);
  const [recordedChunks, setRecordedChunks] = useState<Blob[]>([]);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [recordedBlobUrl, setRecordedBlobUrl] = useState<string | null>(null);
  const [isSavingToAlbum, setIsSavingToAlbum] = useState(false);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const timerIntervalRef = useRef<any>(null);
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);

  // Configuration for ICE Servers (Standard public STUN server for P2P connection)
  const rtcConfig = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
    ]
  };

  // Helper to send WebRTC signals
  const sendSignal = async (signalData: any) => {
    try {
      await apiClient.post('/api/call/signal', {
        senderId: activePartner,
        recipientId,
        signal: signalData
      }, { 'X-Pairing-Code': pairingCode });
    } catch (e) {
      console.error('Failed to send signaling message:', e);
    }
  };

  useEffect(() => {
    if (isIncoming) {
      setCallState('ringing');
    } else {
      setCallState('dialing');
      startCall();
    }

    // Set up window listener to clean up streams on page reload/close
    const handleBeforeUnload = () => {
      endCall(false);
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      endCall(false);
    };
  }, []);

  // Listen to signal updates from App.tsx via globalEventBus or SSE event trigger
  useEffect(() => {
    const handleSignal = (event: CustomEvent) => {
      const { signal } = event.detail;
      if (!peerConnectionRef.current) {
        // Buffer candidates arriving before peer connection is created
        if (signal.type === 'candidate') {
          pendingCandidatesRef.current.push(signal.candidate);
        }
        return;
      }

      if (signal.type === 'answer') {
        peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(signal));
        setCallState('connected');
      } else if (signal.type === 'candidate') {
        peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(signal.candidate))
          .catch(err => console.error('Error adding ICE candidate:', err));
      }
    };

    window.addEventListener('webrtc-signal' as any, handleSignal);
    return () => {
      window.removeEventListener('webrtc-signal' as any, handleSignal);
    };
  }, []);

  // Timer for call recording
  useEffect(() => {
    if (isRecording) {
      timerIntervalRef.current = setInterval(() => {
        setRecordingDuration(prev => prev + 1);
      }, 1000);
    } else {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
      setRecordingDuration(0);
    }
    return () => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
    };
  }, [isRecording]);

  // Hook up video streams to HTML elements
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  // Start call logic (For Caller)
  const startCall = async () => {
    try {
      // 1. Get user media
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: callType === 'video'
      });
      setLocalStream(stream);

      // 2. Create RTCPeerConnection
      const pc = new RTCPeerConnection(rtcConfig);
      peerConnectionRef.current = pc;

      // Add tracks
      stream.getTracks().forEach(track => {
        pc.addTrack(track, stream);
      });

      // Handle remote track
      pc.ontrack = (event) => {
        if (event.streams && event.streams[0]) {
          setRemoteStream(event.streams[0]);
          setCallState('connected');
        }
      };

      // Handle ICE Candidates
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          sendSignal({
            type: 'candidate',
            candidate: event.candidate
          });
        }
      };

      // Create Offer
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      
      // Send offer signal
      await sendSignal({
        type: 'offer',
        sdp: offer.sdp,
        video: callType === 'video'
      });

    } catch (e) {
      console.error('Failed to start call stream:', e);
      alert('Không thể mở Camera/Microphone để bắt đầu cuộc gọi.');
      endCall();
    }
  };

  // Accept incoming call logic
  const acceptCall = async () => {
    if (!incomingSignal) return;
    try {
      setCallState('connected');

      // 1. Get local media
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: callType === 'video'
      });
      setLocalStream(stream);

      // 2. Create peer connection
      const pc = new RTCPeerConnection(rtcConfig);
      peerConnectionRef.current = pc;

      // Flush candidates that arrived before PC was ready
      for (const candidate of pendingCandidatesRef.current) {
        pc.addIceCandidate(new RTCIceCandidate(candidate))
          .catch(err => console.error('Error adding pending ICE candidate:', err));
      }
      pendingCandidatesRef.current = [];

      // Add tracks
      stream.getTracks().forEach(track => {
        pc.addTrack(track, stream);
      });

      // Handle remote track
      pc.ontrack = (event) => {
        if (event.streams && event.streams[0]) {
          setRemoteStream(event.streams[0]);
        }
      };

      // Handle ICE
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          sendSignal({
            type: 'candidate',
            candidate: event.candidate
          });
        }
      };

      // Set remote description (Offer)
      await pc.setRemoteDescription(new RTCSessionDescription({
        type: 'offer',
        sdp: incomingSignal.sdp
      }));

      // Create answer
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      // Send answer
      await sendSignal({
        type: 'answer',
        sdp: answer.sdp
      });

    } catch (e) {
      console.error('Failed to accept call stream:', e);
      alert('Không thể mở Camera/Microphone để tham gia cuộc gọi.');
      endCall();
    }
  };

  // Decline or end call
  const endCall = (sendHangup = true) => {
    if (sendHangup) {
      sendSignal({ type: 'hangup' });
    }

    // Stop recording if active
    if (isRecording) {
      stopRecording();
    }

    // Stop tracks
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
    }
    if (remoteStream) {
      remoteStream.getTracks().forEach(track => track.stop());
    }

    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }

    setLocalStream(null);
    setRemoteStream(null);
    setCallState('ended');
    setTimeout(() => {
      onClose();
    }, 1500);
  };

  // Toggle Mute Audio
  const toggleAudio = () => {
    if (localStream) {
      localStream.getAudioTracks().forEach(track => {
        track.enabled = !track.enabled;
      });
      setIsAudioMuted(!isAudioMuted);
    }
  };

  // Toggle Mute Video
  const toggleVideo = () => {
    if (localStream && callType === 'video') {
      localStream.getVideoTracks().forEach(track => {
        track.enabled = !track.enabled;
      });
      setIsVideoMuted(!isVideoMuted);
    }
  };

  // Mix local & remote audio streams and combine with remote video for Call Recording
  const startRecording = () => {
    if (!localStream || !remoteStream) return;
    try {
      const chunks: Blob[] = [];
      setRecordedChunks([]);
      setRecordedBlobUrl(null);

      // Mix Audio using Web Audio API
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      const audioCtx = new AudioCtxClass();
      audioContextRef.current = audioCtx;

      const localSource = audioCtx.createMediaStreamSource(localStream);
      const remoteSource = audioCtx.createMediaStreamSource(remoteStream);
      const dest = audioCtx.createMediaStreamDestination();

      localSource.connect(dest);
      remoteSource.connect(dest);

      // Combine video track and mixed audio destination
      const combinedStream = new MediaStream();
      
      // If we have video, add remote video track
      const remoteVideoTracks = remoteStream.getVideoTracks();
      const localVideoTracks = localStream.getVideoTracks();
      
      if (remoteVideoTracks.length > 0) {
        combinedStream.addTrack(remoteVideoTracks[0]);
      } else if (localVideoTracks.length > 0) {
        combinedStream.addTrack(localVideoTracks[0]);
      }

      // Add mixed audio track
      dest.stream.getAudioTracks().forEach(track => {
        combinedStream.addTrack(track);
      });

      // Initialize MediaRecorder
      const options = { mimeType: 'video/webm;codecs=vp8,opus' };
      const recorder = new MediaRecorder(combinedStream, options);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunks.push(event.data);
        }
      };

      recorder.onstop = () => {
        const finalBlob = new Blob(chunks, { type: 'video/webm' });
        setRecordedChunks(chunks);
        const url = URL.createObjectURL(finalBlob);
        setRecordedBlobUrl(url);
      };

      recorder.start(1000); // chunk every 1 second
      setIsRecording(true);
    } catch (e) {
      console.error('Failed to initialize screen/call recording:', e);
      alert('Không hỗ trợ ghi âm/ghi hình cuộc gọi trên trình duyệt này.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {});
      }
    }
  };

  // Export recording to E2EE Album
  const saveRecordingToAlbum = async () => {
    if (recordedChunks.length === 0) return;
    setIsSavingToAlbum(true);
    try {
      const finalBlob = new Blob(recordedChunks, { type: 'video/webm' });
      
      // Convert Blob to Base64 String
      const reader = new FileReader();
      reader.readAsDataURL(finalBlob);
      reader.onloadend = () => {
        const base64data = reader.result as string;
        onSaveToAlbum(base64data, callType);
        setIsSavingToAlbum(false);
        setRecordedBlobUrl(null);
        setRecordedChunks([]);
        alert('Đã lưu cuộc gọi mã hóa thành công vào Album kỷ niệm!');
      };
    } catch (e) {
      console.error(e);
      alert('Gặp lỗi khi tải lên Album.');
      setIsSavingToAlbum(false);
    }
  };

  const formatTimer = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remainSecs = secs % 60;
    return `${mins.toString().padStart(2, '0')}:${remainSecs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="fixed inset-0 z-[9999] bg-[#090b11]/95 backdrop-blur-xl flex flex-col justify-between p-6 overflow-hidden">
      
      {/* Encryption Badge */}
      <div className="flex justify-center items-center gap-1.5 text-emerald-400/80 text-[10px] font-medium py-1.5 px-3 bg-emerald-500/10 rounded-full border border-emerald-500/15 w-fit mx-auto mt-4 animate-fade-in font-mono">
        <Shield className="w-3 h-3" />
        <span>CUỘC GỌI MÃ HÓA ĐẦU CUỐI (P2P E2EE)</span>
      </div>

      {/* Main Calling Content */}
      <div className="flex-1 flex flex-col items-center justify-center gap-6 my-auto">
        {/* Ringing/Dialing Profile Info */}
        {callState !== 'connected' && (
          <div className="text-center space-y-4">
            <div className="relative">
              {/* Outer pulsing ring */}
              <div className={`absolute inset-0 rounded-full bg-[#c5a059]/10 border border-[#c5a059]/20 scale-150 ${callState === 'ringing' || callState === 'dialing' ? 'animate-ping' : ''}`} />
              <img
                src={recipientAvatar || 'https://images.unsplash.com/photo-1518199266791-5375a83190b7'}
                alt={recipientName}
                className="w-24 h-24 rounded-full object-cover border-2 border-[#c5a059]/50 shadow-2xl relative z-10"
              />
            </div>
            <div className="space-y-1">
              <h2 className="text-lg font-bold text-slate-100">{recipientName}</h2>
              <p className="text-xs text-slate-400 animate-pulse font-mono tracking-wider">
                {callState === 'dialing' && 'ĐANG ĐỔ CHUÔNG...'}
                {callState === 'ringing' && 'CUỘC GỌI ĐẾN...'}
                {callState === 'ended' && 'CUỘC GỌI KẾT THÚC'}
              </p>
            </div>
          </div>
        )}

        {/* Remote full-view and local mini-view for Active Call */}
        {callState === 'connected' && (
          <div className="w-full max-w-sm aspect-[3/4] bg-slate-950 rounded-3xl overflow-hidden border border-white/5 relative shadow-2xl">
            {/* Remote Video Stream */}
            {callType === 'video' && remoteStream ? (
              <video
                ref={remoteVideoRef}
                autoPlay
                playsInline
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center gap-3 bg-gradient-to-b from-[#11131c] to-[#0c0d14]">
                <img
                  src={recipientAvatar}
                  alt={recipientName}
                  className="w-20 h-20 rounded-full object-cover border-2 border-white/10"
                />
                <div className="text-center">
                  <span className="text-xs text-slate-400 font-sans font-medium">{recipientName}</span>
                  <p className="text-[10px] text-emerald-400 font-mono mt-1">Đang đàm thoại...</p>
                </div>
              </div>
            )}

            {/* Local Video Mini PIP Overlay */}
            {callType === 'video' && localStream && !isVideoMuted && (
              <div className="absolute right-4 top-4 w-24 aspect-[3/4] rounded-xl overflow-hidden border border-white/10 bg-slate-900 shadow-xl">
                <video
                  ref={localVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />
              </div>
            )}

            {/* Screen Recording Pulsing Timer */}
            {isRecording && (
              <div className="absolute left-4 top-4 bg-red-600/90 text-white text-[9px] font-bold py-1 px-2.5 rounded-full flex items-center gap-1.5 animate-pulse shadow-md font-mono">
                <div className="w-2 h-2 rounded-full bg-white" />
                <span>REC {formatTimer(recordingDuration)}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Screen Recording Result Modal */}
      {recordedBlobUrl && (
        <div className="fixed inset-0 z-[10000] bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-white/10 rounded-3xl p-6 w-full max-w-xs space-y-4 text-center">
            <div className="w-12 h-12 rounded-full bg-emerald-500/10 text-emerald-400 flex items-center justify-center mx-auto">
              <Disc className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-100">Bản ghi cuộc gọi đã sẵn sàng</h3>
              <p className="text-[10px] text-slate-400 mt-1 leading-relaxed">
                Bạn muốn tải về máy hay tải lên Album kỷ niệm của hai bạn dưới dạng mã hóa đầu cuối?
              </p>
            </div>
            
            {/* Saved Video Preview */}
            <div className="aspect-[4/3] rounded-lg overflow-hidden border border-white/5 bg-black">
              <video src={recordedBlobUrl} controls className="w-full h-full object-cover" />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <a
                href={recordedBlobUrl}
                download={`Duo-Call-Record-${Date.now()}.webm`}
                className="bg-white/5 hover:bg-white/10 border border-white/10 text-slate-200 text-[10px] font-semibold py-2 px-3 rounded-xl flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Tải về</span>
              </a>
              <button
                disabled={isSavingToAlbum}
                onClick={saveRecordingToAlbum}
                className="bg-[#c5a059] hover:bg-[#b08b47] text-black text-[10px] font-semibold py-2 px-3 rounded-xl flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>{isSavingToAlbum ? 'Đang lưu...' : 'Lưu Album'}</span>
              </button>
            </div>
            <button
              onClick={() => {
                setRecordedBlobUrl(null);
                setRecordedChunks([]);
              }}
              className="text-[9px] text-slate-500 hover:text-slate-400 block mx-auto underline mt-2"
            >
              Bỏ qua bản ghi
            </button>
          </div>
        </div>
      )}

      {/* Calling Actions Footer */}
      <div className="w-full max-w-sm mx-auto mb-4 flex flex-col gap-6">
        
        {/* Ringing Controls (Incoming Screen) */}
        {callState === 'ringing' && (
          <div className="flex justify-around items-center gap-4">
            <button
              onClick={() => endCall(true)}
              className="w-14 h-14 rounded-full bg-rose-600 hover:bg-rose-700 text-white flex items-center justify-center shadow-lg transition-transform hover:scale-105 cursor-pointer"
            >
              <PhoneOff className="w-6 h-6" />
            </button>
            <button
              onClick={acceptCall}
              className="w-14 h-14 rounded-full bg-emerald-500 hover:bg-emerald-600 text-white flex items-center justify-center shadow-lg transition-transform hover:scale-105 cursor-pointer"
            >
              <Phone className="w-6 h-6 animate-pulse" />
            </button>
          </div>
        )}

        {/* Connected / Dialing Controls */}
        {callState !== 'ringing' && callState !== 'ended' && (
          <div className="flex flex-col gap-4">
            
            {/* Screen Call Recording Toggle */}
            {callState === 'connected' && (
              <div className="flex justify-center">
                {!isRecording ? (
                  <button
                    onClick={startRecording}
                    className="flex items-center gap-1.5 px-4 py-2 bg-red-950/40 hover:bg-red-950/60 border border-red-500/20 hover:border-red-500/40 rounded-full text-red-400 hover:text-red-300 text-[10px] font-semibold transition-all cursor-pointer"
                  >
                    <Disc className="w-3.5 h-3.5" />
                    <span>Ghi âm/Ghi hình cuộc gọi</span>
                  </button>
                ) : (
                  <button
                    onClick={stopRecording}
                    className="flex items-center gap-1.5 px-4 py-2 bg-red-600 hover:bg-red-700 rounded-full text-white text-[10px] font-semibold transition-all animate-pulse cursor-pointer shadow-md"
                  >
                    <Disc className="w-3.5 h-3.5" />
                    <span>Dừng ghi âm/ghi hình</span>
                  </button>
                )}
              </div>
            )}

            {/* Standard Media Controls */}
            <div className="flex justify-center items-center gap-6">
              {/* Mic Toggle */}
              <button
                onClick={toggleAudio}
                className={`w-12 h-12 rounded-full border flex items-center justify-center transition-all cursor-pointer ${isAudioMuted ? 'bg-rose-500/10 border-rose-500/20 text-rose-400' : 'bg-white/5 border-white/10 hover:bg-white/10 text-slate-200'}`}
              >
                {isAudioMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
              </button>

              {/* End Call Button */}
              <button
                onClick={() => endCall(true)}
                className="w-14 h-14 rounded-full bg-rose-600 hover:bg-rose-700 text-white flex items-center justify-center shadow-lg transition-transform hover:scale-105 cursor-pointer"
              >
                <PhoneOff className="w-6 h-6" />
              </button>

              {/* Video Camera Toggle */}
              {callType === 'video' ? (
                <button
                  onClick={toggleVideo}
                  className={`w-12 h-12 rounded-full border flex items-center justify-center transition-all cursor-pointer ${isVideoMuted ? 'bg-rose-500/10 border-rose-500/20 text-rose-400' : 'bg-white/5 border-white/10 hover:bg-white/10 text-slate-200'}`}
                >
                  {isVideoMuted ? <VideoOff className="w-5 h-5" /> : <Video className="w-5 h-5" />}
                </button>
              ) : (
                <div className="w-12 h-12" /> // spacer
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
