// Lecteur de QR des téléphones sans lecteur intégré (iPhone, certains Android) : sans lui, la bibliothèque du scanner
// lit mal les vraies photos et prend parfois le QR pour un code-barres. On lui donne un « BarcodeDetector » qui
// s'appuie sur ZXing (WebAssembly, gardé sur le serveur), seulement une fois prêt et seulement s'il n'y en a pas déjà un.
(function () {
  if ('BarcodeDetector' in window || typeof ZXingWASM === 'undefined' || typeof WebAssembly === 'undefined') return;
  let zx = null;
  ZXingWASM.prepareZXingModule({
    overrides: { locateFile: (p, prefix) => (p.endsWith('.wasm') ? new URL('vendor/zxing_reader.wasm', location.href).href : prefix + p) },
    fireImmediately: true
  }).then(() => { zx = ZXingWASM; window.BarcodeDetector = ZxingBarcodeDetector; }).catch(() => {});

  const canvas = document.createElement('canvas');
  function pixelsOf(src) {
    if (src instanceof ImageData) return src;
    const w = src.videoWidth || src.naturalWidth || src.width, h = src.videoHeight || src.naturalHeight || src.height;
    if (src instanceof HTMLCanvasElement) return src.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h);
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(src, 0, 0, w, h);
    return ctx.getImageData(0, 0, w, h);
  }
  class ZxingBarcodeDetector {
    constructor() {}
    static async getSupportedFormats() { return ['qr_code']; }
    async detect(src) {
      if (!zx) return [];
      const found = await zx.readBarcodes(pixelsOf(src), { formats: ['QRCode'], tryHarder: true, tryInvert: true, maxNumberOfSymbols: 1 });
      return found.filter(r => r.isValid && r.text).map(r => {
        const p = r.position, xs = [p.topLeft.x, p.topRight.x, p.bottomLeft.x, p.bottomRight.x], ys = [p.topLeft.y, p.topRight.y, p.bottomLeft.y, p.bottomRight.y];
        const x = Math.min(...xs), y = Math.min(...ys);
        return { rawValue: r.text, format: 'qr_code', boundingBox: { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y }, cornerPoints: [p.topLeft, p.topRight, p.bottomRight, p.bottomLeft] };
      });
    }
  }
})();
