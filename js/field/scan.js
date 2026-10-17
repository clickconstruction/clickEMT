// Reading a code with the phone's camera: a QR (the join code) or the PDF417 barcode on the back
// of a driver's licence. BarcodeDetector where the browser has it for that format, else jsQR
// (vendor/jsQR-1.4.0.js) for QR and ZXing (vendor/zxing-library-0.21.3.min.js) for PDF417, each
// loaded only when scanning starts. start() shows the camera in the video element and calls
// onText with each code it sees; the caller decides what the text means and stops the scan.
const loading = new Map();
function loadScript(file, globalName) {
  if (window[globalName]) return Promise.resolve(window[globalName]);
  if (!loading.has(file)) {
    loading.set(file, new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = new URL('../vendor/' + file, import.meta.url).href;
      s.onload = () => resolve(window[globalName]);
      s.onerror = () => { loading.delete(file); reject(new Error('The code reader did not load. Type it instead.')); };
      document.head.appendChild(s);
    }));
  }
  return loading.get(file);
}
async function detectorFor(format) {
  if (!('BarcodeDetector' in window)) return null;
  try {
    const have = window.BarcodeDetector.getSupportedFormats ? await window.BarcodeDetector.getSupportedFormats() : [];
    if (have.length && !have.includes(format)) return null;
    return new window.BarcodeDetector({ formats: [format] });
  } catch (e) { return null; }
}
// ZXing's reader for one format, decoding a canvas
async function zxingReader(format) {
  const Z = await loadScript('zxing-library-0.21.3.min.js', 'ZXing');
  const hints = new Map();
  hints.set(Z.DecodeHintType.POSSIBLE_FORMATS, [format === 'pdf417' ? Z.BarcodeFormat.PDF_417 : Z.BarcodeFormat.QR_CODE]);
  hints.set(Z.DecodeHintType.TRY_HARDER, true);
  const reader = new Z.MultiFormatReader();
  reader.setHints(hints);
  return (canvas) => {
    try {
      const r = reader.decode(new Z.BinaryBitmap(new Z.HybridBinarizer(new Z.HTMLCanvasElementLuminanceSource(canvas))));
      return r ? r.getText() : null;
    } catch (e) { return null; }
  };
}

// format: 'qr_code' (default) or 'pdf417'
export async function startScan(video, onText, { format = 'qr_code' } = {}) {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('This phone cannot open the camera here. Type the code instead.');
  const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false }).catch((err) => {
    throw new Error(err && err.name === 'NotAllowedError' ? 'Camera permission was refused. Type the code instead.' : 'The camera could not be opened. Type the code instead.');
  });
  video.srcObject = stream;
  video.setAttribute('playsinline', '');
  video.muted = true;
  await video.play().catch(() => {});
  let stopped = false;
  const detector = await detectorFor(format);
  let jsQR = null, zx = null;
  if (!detector) {
    if (format === 'pdf417') zx = await zxingReader(format);
    else jsQR = await loadScript('jsQR-1.4.0.js', 'jsQR');
  }
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const maxW = format === 'pdf417' ? 1280 : 640;   // the licence barcode is dense: keep the detail
  async function tick() {
    if (stopped) return;
    try {
      if (video.readyState >= 2 && video.videoWidth) {
        let text = null;
        if (detector) {
          const codes = await detector.detect(video);
          if (codes && codes.length) text = codes[0].rawValue;
        } else {
          const w = Math.min(maxW, video.videoWidth), h = Math.round(video.videoHeight * (w / video.videoWidth));
          canvas.width = w; canvas.height = h;
          ctx.drawImage(video, 0, 0, w, h);
          if (zx) text = zx(canvas);
          else {
            const img = ctx.getImageData(0, 0, w, h);
            const r = jsQR(img.data, w, h, { inversionAttempts: 'dontInvert' });
            if (r && r.data) text = r.data;
          }
        }
        if (text && !stopped) onText(text);
      }
    } catch (e) { /* a frame that would not decode */ }
    if (!stopped) setTimeout(tick, format === 'pdf417' ? 400 : 250);
  }
  tick();
  return {
    stop() {
      stopped = true;
      for (const t of stream.getTracks()) t.stop();
      video.srcObject = null;
    },
    how: detector ? 'the browser' : (zx ? 'ZXing' : 'jsQR')
  };
}
