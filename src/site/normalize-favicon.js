const fs = require("fs");
const path = require("path");

const MAX_DIM = 512;

function normalizeFavicon(inputPath, outputPath) {
  const content = fs.readFileSync(inputPath, "utf8");

  const svgTagMatch = content.match(/<svg\b[^>]*>/i);
  if (!svgTagMatch) {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, content);
    return;
  }

  const svgTag = svgTagMatch[0];
  const widthMatch = svgTag.match(/\bwidth\s*=\s*"([^"]+)"/i);
  const heightMatch = svgTag.match(/\bheight\s*=\s*"([^"]+)"/i);
  const viewBoxMatch = svgTag.match(/\bviewBox\s*=\s*"([^"]+)"/i);

  const parseDim = (s) => {
    if (s === undefined || s === null) return NaN;
    const m = String(s).match(/^[\d.]+/);
    return m ? parseFloat(m[0]) : NaN;
  };

  let effectiveWidth = parseDim(widthMatch && widthMatch[1]);
  let effectiveHeight = parseDim(heightMatch && heightMatch[1]);

  if ((!isFinite(effectiveWidth) || !isFinite(effectiveHeight)) && viewBoxMatch) {
    const vb = viewBoxMatch[1].trim().split(/[\s,]+/).map(parseFloat);
    if (vb.length === 4) {
      if (!isFinite(effectiveWidth)) effectiveWidth = vb[2];
      if (!isFinite(effectiveHeight)) effectiveHeight = vb[3];
    }
  }

  const maxDim = Math.max(effectiveWidth || 0, effectiveHeight || 0);

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  if (!isFinite(maxDim) || maxDim === 0 || maxDim <= MAX_DIM) {
    fs.writeFileSync(outputPath, content);
    return;
  }

  const scale = MAX_DIM / maxDim;
  const newWidth = Math.round(effectiveWidth * scale);
  const newHeight = Math.round(effectiveHeight * scale);

  let newSvgTag = svgTag;

  if (!viewBoxMatch) {
    newSvgTag = newSvgTag.replace(
      /<svg\b/i,
      `<svg viewBox="0 0 ${effectiveWidth} ${effectiveHeight}"`
    );
  }

  if (widthMatch) {
    newSvgTag = newSvgTag.replace(/\bwidth\s*=\s*"[^"]+"/i, `width="${newWidth}"`);
  } else {
    newSvgTag = newSvgTag.replace(/<svg\b/i, `<svg width="${newWidth}"`);
  }
  if (heightMatch) {
    newSvgTag = newSvgTag.replace(/\bheight\s*=\s*"[^"]+"/i, `height="${newHeight}"`);
  } else {
    newSvgTag = newSvgTag.replace(/<svg\b/i, `<svg height="${newHeight}"`);
  }

  fs.writeFileSync(outputPath, content.replace(svgTag, newSvgTag));
}

module.exports = normalizeFavicon;
