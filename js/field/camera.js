// The phone's own camera through a file input, then the picture shrunk to a size that sends
// quickly on a weak signal. Orientation from the camera is honoured where the browser can.
const MAX_SIDE = 1600;
const QUALITY = 0.82;

export function pickPhoto(input) {
  return new Promise((resolve, reject) => {
    const onChange = () => {
      input.removeEventListener('change', onChange);
      const file = input.files && input.files[0];
      input.value = '';
      if (file) resolve(file); else reject(new Error('No photo taken'));
    };
    input.addEventListener('change', onChange);
    input.click();
  });
}

async function decode(file) {
  if ('createImageBitmap' in window) {
    try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch (e) { /* fall through */ }
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read the photo')); };
    img.src = url;
  });
}

export async function shrink(file) {
  const img = await decode(file);
  const w = img.width || img.naturalWidth, h = img.height || img.naturalHeight;
  const scale = Math.min(1, MAX_SIDE / Math.max(w, h));
  const cw = Math.round(w * scale), ch = Math.round(h * scale);
  const canvas = document.createElement('canvas');
  canvas.width = cw; canvas.height = ch;
  canvas.getContext('2d').drawImage(img, 0, 0, cw, ch);
  if (img.close) img.close();
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Could not encode the photo')), 'image/jpeg', QUALITY);
  });
}
