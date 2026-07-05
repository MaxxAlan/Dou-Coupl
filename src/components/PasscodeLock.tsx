import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Lock, Unlock, ShieldAlert, Fingerprint } from 'lucide-react';
import { storageHelper } from '../lib/storage';

interface PasscodeLockProps {
  onUnlock: () => void;
  correctPasscode: string;
  isSettingMode?: boolean;
  onSetPasscodeComplete?: (pin: string) => void;
  onCancelSetting?: () => void;
  onVerifyPasscode?: (pin: string) => Promise<boolean>;
}

export default function PasscodeLock({
  onUnlock,
  correctPasscode,
  isSettingMode = false,
  onSetPasscodeComplete,
  onCancelSetting,
  onVerifyPasscode
}: PasscodeLockProps) {
  const [pin, setPin] = useState<string>('');
  const [stage, setStage] = useState<'enter' | 'confirm'>(isSettingMode ? 'enter' : 'enter');
  const [firstPin, setFirstPin] = useState<string>('');
  const [error, setError] = useState<boolean>(false);
  const [isScanningFace, setIsScanningFace] = useState<boolean>(false);
  const [scanSuccess, setScanSuccess] = useState<boolean>(false);
  const [webAuthnError, setWebAuthnError] = useState<string | null>(null);
  const [isSimulationMode, setIsSimulationMode] = useState<boolean>(false);

  useEffect(() => {
    if (pin.length === 4) {
      if (isSettingMode) {
        if (stage === 'enter') {
          setFirstPin(pin);
          setPin('');
          setStage('confirm');
        } else {
          // Confirm stage
          if (pin === firstPin) {
            if (onSetPasscodeComplete) {
              onSetPasscodeComplete(pin);
            }
          } else {
            setError(true);
            setTimeout(() => {
              setError(false);
              setPin('');
              setStage('enter');
              setFirstPin('');
            }, 1000);
          }
        }
      } else {
        // Unlocking mode
        if (onVerifyPasscode) {
          onVerifyPasscode(pin).then(isValid => {
            if (isValid) {
              onUnlock();
            } else {
              setError(true);
              setTimeout(() => {
                setError(false);
                setPin('');
              }, 800);
            }
          }).catch(() => {
            setError(true);
            setTimeout(() => {
              setError(false);
              setPin('');
            }, 800);
          });
        } else if (pin === correctPasscode || correctPasscode === '') {
          onUnlock();
        } else {
          setError(true);
          // Haptic-like visual shake
          setTimeout(() => {
            setError(false);
            setPin('');
          }, 800);
        }
      }
    }
  }, [pin, correctPasscode, isSettingMode, stage, firstPin, onUnlock, onSetPasscodeComplete, onVerifyPasscode]);

  const handleKeyPress = (num: string) => {
    if (pin.length < 4) {
      setPin(prev => prev + num);
    }
  };

  const handleBackspace = () => {
    setPin(prev => prev.slice(0, -1));
  };

  const triggerFaceID = async () => {
    if (isSettingMode) return;
    setIsScanningFace(true);
    setScanSuccess(false);
    setWebAuthnError(null);
    setIsSimulationMode(false);

    const credIdBase64 = storageHelper.getItem<string>('webauthn_credential_id', '');

    // If no credential is registered yet, fall back to simulated scanner so they can preview the flow!
    if (!credIdBase64) {
      setIsSimulationMode(true);
      // Simulate scanning
      setTimeout(() => {
        setScanSuccess(true);
        setTimeout(() => {
          setIsScanningFace(false);
          onUnlock();
        }, 800);
      }, 1800);
      return;
    }

    try {
      if (!window.PublicKeyCredential) {
        throw new Error('Trình duyệt không hỗ trợ WebAuthn.');
      }

      const challenge = new Uint8Array(32);
      window.crypto.getRandomValues(challenge);

      // Convert stored base64 credential ID back to binary
      const binary = window.atob(credIdBase64);
      const allowCredId = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        allowCredId[i] = binary.charCodeAt(i);
      }

      const requestOptions: CredentialRequestOptions = {
        publicKey: {
          challenge: challenge,
          allowCredentials: [{
            type: 'public-key',
            id: allowCredId.buffer
          }],
          userVerification: "required",
          timeout: 60000
        }
      };

      const assertion = await navigator.credentials.get(requestOptions) as PublicKeyCredential;

      if (assertion) {
        setScanSuccess(true);
        setTimeout(() => {
          setIsScanningFace(false);
          onUnlock();
        }, 800);
      }
    } catch (err: any) {
      console.error('WebAuthn assertion failed:', err);
      if (err.name === 'SecurityError' || err.name === 'NotAllowedError') {
        setWebAuthnError('iframe_blocked');
      } else {
        setWebAuthnError(err.message || 'Hủy bỏ xác thực.');
      }
    }
  };

  return (
    <div className="absolute inset-0 z-50 flex flex-col justify-between bg-[#080808] text-slate-100 p-8 font-sans select-none">
      {/* Background decoration */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-72 h-72 rounded-full bg-[#c5a059]/5 blur-[100px] pointer-events-none" />
      <div className="absolute bottom-1/4 left-1/3 w-60 h-60 rounded-full bg-amber-900/5 blur-[80px] pointer-events-none" />

      {/* Header */}
      <div className="mt-12 flex flex-col items-center">
        <motion.div
          animate={error ? { x: [-10, 10, -10, 10, 0] } : {}}
          transition={{ duration: 0.4 }}
          className={`w-14 h-14 rounded-full flex items-center justify-center mb-4 border ${
            error ? 'bg-red-500/20 border-red-500/50' : 'bg-white/[0.02] border-white/5'
          }`}
        >
          {error ? (
            <ShieldAlert className="w-6 h-6 text-red-500" />
          ) : correctPasscode ? (
            <Lock className="w-6 h-6 text-[#c5a059]" />
          ) : (
            <Unlock className="w-6 h-6 text-[#c5a059]" />
          )}
        </motion.div>

        <h2 className="text-lg font-light font-serif tracking-wide text-slate-100">
          {isSettingMode
            ? stage === 'enter'
              ? 'Thiết lập mã khoá'
              : 'Xác nhận mã khoá'
            : 'Ứng dụng đã khoá'}
        </h2>
        <p className="text-[10px] text-slate-400 mt-2 font-mono">
          {isSettingMode
            ? stage === 'enter'
              ? 'Nhập 4 chữ số bảo mật riêng tư'
              : 'Nhập lại mã khoá vừa tạo'
            : 'Nhập mã khoá để tiếp tục hâm nóng tình cảm'}
        </p>

        {/* Pin Dots Indicators */}
        <div className="flex gap-4 mt-8">
          {[0, 1, 2, 3].map(index => (
            <motion.div
              key={index}
              animate={
                error
                  ? { scale: [1, 1.2, 1], backgroundColor: '#ef4444' }
                  : pin.length > index
                  ? { scale: [1, 1.25, 1], backgroundColor: '#c5a059' }
                  : { scale: 1, backgroundColor: '#222222' }
              }
              className="w-3 h-3 rounded-full transition-colors duration-200"
            />
          ))}
        </div>
      </div>

      {/* Numerical Keypad */}
      <div className="mb-8 w-full max-w-xs mx-auto flex flex-col gap-4">
        <div className="grid grid-cols-3 gap-y-4 gap-x-6 justify-items-center">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(num => (
            <button
              key={num}
              onClick={() => handleKeyPress(num)}
              className="w-15 h-15 rounded-full bg-white/[0.02] hover:bg-white/[0.05] active:bg-white/[0.08] border border-white/5 flex flex-col items-center justify-center transition-all duration-100 cursor-pointer"
            >
              <span className="text-xl font-light text-slate-100">{num}</span>
            </button>
          ))}

          {/* Face ID / Back key */}
          {!isSettingMode ? (
            <button
              onClick={triggerFaceID}
              className="w-15 h-15 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-100 transition-all cursor-pointer"
            >
              <Fingerprint className="w-7 h-7 text-[#c5a059]" />
            </button>
          ) : (
            <button
              onClick={onCancelSetting}
              className="w-15 h-15 rounded-full flex items-center justify-center text-[11px] text-[#c5a059] hover:text-[#f5e0a0] font-medium transition-all cursor-pointer"
            >
              Hủy
            </button>
          )}

          <button
            onClick={() => handleKeyPress('0')}
            className="w-15 h-15 rounded-full bg-white/[0.02] hover:bg-white/[0.05] active:bg-white/[0.08] border border-white/5 flex items-center justify-center transition-all duration-100 cursor-pointer"
          >
            <span className="text-xl font-light text-slate-100">0</span>
          </button>

          <button
            onClick={handleBackspace}
            className="w-15 h-15 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-100 transition-all text-xs font-medium cursor-pointer"
          >
            Xóa
          </button>
        </div>
      </div>

      {/* FaceID Scan Simulation Overlay */}
      <AnimatePresence>
        {isScanningFace && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 bg-black/95 flex flex-col items-center justify-center p-6 text-center"
          >
            {webAuthnError ? (
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="w-full max-w-xs bg-zinc-900/90 border border-white/10 rounded-2xl p-5 flex flex-col items-center"
              >
                <div className="w-12 h-12 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 mb-4 animate-pulse">
                  <ShieldAlert className="w-6 h-6" />
                </div>
                
                <h3 className="text-sm font-medium text-slate-100">
                  {webAuthnError === 'iframe_blocked' 
                    ? 'Iframe chặn API sinh trắc' 
                    : 'Lỗi xác thực sinh trắc'}
                </h3>
                
                <p className="text-[10px] text-slate-400 mt-2 leading-relaxed font-sans">
                  {webAuthnError === 'iframe_blocked' 
                    ? 'Do ứng dụng chạy bên trong khung thử nghiệm (iframe) của AI Studio, Trình duyệt chặn quyền truy cập cảm biến Face ID / Vân tay.' 
                    : `Cảm biến phản hồi lỗi: "${webAuthnError}". Vui lòng thử lại.`}
                </p>

                <div className="w-full flex flex-col gap-2 mt-5">
                  <button
                    onClick={() => {
                      setWebAuthnError(null);
                      setIsSimulationMode(true);
                      setScanSuccess(false);
                      // Trigger fallback scan simulation
                      setTimeout(() => {
                        setScanSuccess(true);
                        setTimeout(() => {
                          setIsScanningFace(false);
                          onUnlock();
                        }, 800);
                      }, 1500);
                    }}
                    className="w-full bg-[#c5a059] hover:bg-[#b08b47] active:scale-95 text-black font-semibold text-[10.5px] py-2 rounded-xl transition-all cursor-pointer"
                  >
                    Bỏ qua bằng Face ID giả lập
                  </button>

                  <button
                    onClick={() => window.open(window.location.href, '_blank')}
                    className="w-full bg-white/5 hover:bg-white/10 text-slate-200 text-[10px] py-2 rounded-xl transition-all cursor-pointer"
                  >
                    Mở ứng dụng ở Tab mới
                  </button>

                  <button
                    onClick={() => setIsScanningFace(false)}
                    className="w-full text-slate-500 hover:text-slate-300 text-[10px] py-1 mt-1 transition-all cursor-pointer font-medium"
                  >
                    Quay lại nhập mã PIN
                  </button>
                </div>
              </motion.div>
            ) : (
              <>
                {/* Pulsing Face Frame */}
                <div className="relative w-64 h-64 border-2 border-dashed border-[#c5a059]/40 rounded-3xl flex items-center justify-center overflow-hidden bg-black/50 backdrop-blur-sm">
                  {/* Laser line scanner */}
                  <motion.div
                    animate={{ top: ['0%', '100%', '0%'] }}
                    transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }}
                    className="absolute left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-[#c5a059] to-transparent shadow-[0_0_15px_#c5a059]"
                  />

                  {/* Grid dots pattern representing 3D mapping */}
                  <div className="absolute inset-0 grid grid-cols-8 grid-rows-8 gap-2 p-4 opacity-10 pointer-events-none">
                    {Array.from({ length: 64 }).map((_, i) => (
                      <div key={i} className="w-1 h-1 rounded-full bg-[#c5a059]" />
                    ))}
                  </div>

                  {/* Status Face Indicator */}
                  <motion.div
                    animate={scanSuccess ? { scale: [1, 1.1, 1], rotate: [0, 3, -3, 0] } : { scale: [1, 1.05, 1] }}
                    transition={{ repeat: scanSuccess ? 0 : Infinity, duration: 1.5 }}
                    className={`w-24 h-24 rounded-full border-4 flex items-center justify-center transition-colors duration-500 ${
                      scanSuccess ? 'border-emerald-500 bg-emerald-500/10' : 'border-[#c5a059]/30 bg-[#c5a059]/5'
                    }`}
                  >
                    <Fingerprint
                      className={`w-12 h-12 transition-colors duration-500 ${
                        scanSuccess ? 'text-emerald-400' : 'text-[#c5a059]'
                      }`}
                    />
                  </motion.div>
                </div>

                <h3 className="text-md font-medium mt-8 text-slate-100">
                  {scanSuccess 
                    ? 'Nhận diện thành công!' 
                    : isSimulationMode 
                    ? 'Đang nhận diện sinh trắc giả lập...' 
                    : 'Đang mở khóa bằng Face ID sinh học...'}
                </h3>
                <p className="text-[10px] text-slate-400 mt-2 font-mono">
                  {scanSuccess 
                    ? 'Face ID Khớp - Xin chào ngọt ngào' 
                    : isSimulationMode 
                    ? 'Đang thực hiện quét 3D giả lập' 
                    : 'Đang gọi thiết bị xác thực sinh trắc của bạn'}
                </p>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
