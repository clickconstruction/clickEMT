// Reading a QR code with the phone's camera: BarcodeDetector where the browser has it (Android
// Chrome, recent Safari), else jsQR (vendor/jsQR-1.4.0.js, Apache 2.0) loaded only when scanning
// starts. start() shows the camera in the video element and calls onText with each code it sees;
// the caller decides what the text means and stops the scan.
let jsQRLoading = null;
function loadJsQR() {
  if (window.jsQR) return Promise.resolve(window.jsQR);
  if (!jsQRLoading) {
    jsQRLoading = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = new URL('../vendor/jsQR-1.4.0.js', import.meta.url).href;
      s.onload = () => resolve(window.jsQR);
      s.onerror = () => { jsQRLoading = null; reject(new Error('The code reader did not load. Type the code instead.')); };
      document.head.appendChild(s);
    });
  }
  return jsQRLoading;
}

export async function startScan(video, onText) {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('This phone cannot open the camera here. Type the code instead.');
  const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false }).catch((err) => {
    throw new Error(err && err.name === 'NotAllowedError' ? 'Camera permission was refused. Type the code instead.' : 'The camera could not be opened. Type the code instead.');
  });
  video.srcObject = stream;
  video.setAttribute('playsinline', '');
  video.muted = true;
  await video.play().catch(() => {});
  let stopped = false;
  let detector = null;
  if ('BarcodeDetector' in window) {
    try { detector = new window.BarcodeDetector({ formats: ['qr_code'] }); } catch (e) { detector = null; }
  }
  let jsQR = null;
  if (!detector) jsQR = await loadJsQR();
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  async function tick() {
    if (stopped) return;
    try {
      if (video.readyState >= 2 && video.videoWidth) {
        let text = null;
        if (detector) {
          const codes = await detector.detect(video);
          if (codes && codes.length) text = codes[0].rawValue;
        } else {
          const w = Math.min(640, video.videoWidth), h = Math.round(video.videoHeight * (w / video.videoWidth));
          canvas.width = w; canvas.height = h;
          ctx.drawImage(video, 0, 0, w, h);
          const img = ctx.getImageData(0, 0, w, h);
          const r = jsQR(img.data, w, h, { inversionAttempts: 'dontInvert' });
          if (r && r.data) text = r.data;
        }
        if (text && !stopped) onText(text);
      }
    } catch (e) { /* a frame that would not decode */ }
    if (!stopped) setTimeout(tick, 250);
  }
  tick();
  return {
    stop() {
      stopped = true;
      for (const t of stream.getTracks()) t.stop();
      video.srcObject = null;
    },
    how: detector ? 'the browser' : 'jsQR'
  };
}
