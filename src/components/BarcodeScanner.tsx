'use client';

import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { BrowserMultiFormatReader, IScannerControls } from '@zxing/browser';

/**
 * Full-screen camera barcode scanner — rear camera preferred automatically
 * (no deviceId given), continuous decode until a code is found or the user
 * cancels. Works on both Android Chrome and iOS Safari over HTTPS (Vercel's
 * default) or localhost; `playsInline` is required specifically for iOS —
 * without it Safari forces its own native fullscreen video player instead of
 * showing the feed inside this overlay.
 */
export function BarcodeScanner({ onDetected, onClose }: { onDetected: (text: string) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const onDetectedRef = useRef(onDetected);
  const [error, setError] = useState<string | null>(null);

  // Refs must not be written during render — keep the latest callback synced
  // via its own effect instead.
  useEffect(() => {
    onDetectedRef.current = onDetected;
  }, [onDetected]);

  useEffect(() => {
    const reader = new BrowserMultiFormatReader();
    let cancelled = false;

    reader
      .decodeFromVideoDevice(undefined, videoRef.current ?? undefined, (result, _err, controls) => {
        controlsRef.current = controls;
        if (cancelled || !result) return; // no code in this frame yet — normal, keep scanning
        controls.stop();
        onDetectedRef.current(result.getText());
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : 'Could not start the camera.';
        setError(/permission|denied/i.test(msg) ? 'Camera permission denied — allow camera access and try again.' : msg);
      });

    return () => {
      // Stops the media stream (turns the camera light off) — without this
      // the browser keeps the camera "on" even after this component unmounts.
      cancelled = true;
      controlsRef.current?.stop();
    };
    // Runs exactly once per mount — onDetected is read via a ref so a new
    // inline function passed in from the caller never restarts the stream.
  }, []);

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black">
      <div className="flex items-center justify-between p-4">
        <span className="text-sm font-medium text-white">Scan barcode</span>
        <button type="button" onClick={onClose} className="rounded-full bg-white/10 p-2 text-white hover:bg-white/20" aria-label="Close scanner">
          <X size={18} />
        </button>
      </div>
      <div className="relative flex-1 overflow-hidden">
        <video ref={videoRef} className="h-full w-full object-cover" muted playsInline />
        <div className="pointer-events-none absolute inset-x-8 top-1/2 h-24 -translate-y-1/2 rounded-lg border-2 border-white/70" />
      </div>
      <div className="p-4 text-center text-xs text-white/70">
        {error ?? 'Point the camera at the tracking barcode'}
      </div>
    </div>
  );
}
