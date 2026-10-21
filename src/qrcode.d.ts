declare module 'qrcode' {
  const QRCode: { toCanvas(canvas: HTMLCanvasElement, text: string, options: { width: number; margin: number; errorCorrectionLevel: string }): Promise<void> };
  export default QRCode;
}
