export function assessRegistrationImage(width: number, height: number, pixels: Uint8ClampedArray, stride: number) {
  if (Math.min(width, height) < 480 || Math.max(width, height) < 640) return "lowResolution";
  const rows = Math.floor(pixels.length / (stride * 4));
  if (stride < 3 || rows < 3) return "lowResolution";

  const brightness = new Float32Array(stride * rows);
  let dark = 0;
  let bright = 0;
  for (let index = 0; index < brightness.length; index++) {
    const pixel = index * 4;
    const value = pixels[pixel] * .2126 + pixels[pixel + 1] * .7152 + pixels[pixel + 2] * .0722;
    brightness[index] = value;
    if (value < 30) dark++;
    if (value > 246) bright++;
  }
  if (dark / brightness.length > .77) return "tooDark";
  if (bright / brightness.length > .88) return "tooBright";

  let sum = 0;
  let sumSquares = 0;
  const interior = (stride - 2) * (rows - 2);
  for (let y = 1; y < rows - 1; y++) {
    for (let x = 1; x < stride - 1; x++) {
      const index = y * stride + x;
      const edge = 4 * brightness[index] - brightness[index - 1] - brightness[index + 1]
        - brightness[index - stride] - brightness[index + stride];
      sum += edge;
      sumSquares += edge * edge;
    }
  }
  if (sumSquares / interior - (sum / interior) ** 2 < 12) return "tooBlurry";
  return null;
}
