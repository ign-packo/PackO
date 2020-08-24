function isInt(value) {
  const x = parseFloat(value);
  return (x || 0) === x;
}
module.exports = function isColor(color) {
  if (!Array.isArray(color)) return false;
  if (!color.length === 3) return false;
  for (let i = 0; i < color.length; i += 1) {
    if (!(isInt(color[i]) && color[i] >= 0 && color[i] < 256)) return false;
  }
  return true;
};
