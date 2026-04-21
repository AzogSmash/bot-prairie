const { GlobalFonts } = require("@napi-rs/canvas");
const path = require("path");

const ENABLE_EXTRA_CANVAS_FONTS = process.env.ENABLE_EXTRA_CANVAS_FONTS !== "false";

function registerFonts() {
  const fontsDir = path.join(__dirname, "..", "assets", "fonts");

  const fonts = [
    ["LilitaOne-Regular.ttf", "Lilita One"],
    ["LilitaOne-Regular.ttf", "Lilita"],
    ["NotoColorEmoji.ttf",    "Noto Color Emoji"],
    ["Unifont.ttf",           "Unifont"],
    ["UnifontUpper.ttf",      "Unifont Upper"],
  ];

  if (ENABLE_EXTRA_CANVAS_FONTS) {
    fonts.push(
      ["NotoSans-Regular.ttf",       "Noto Sans"],
      ["NotoSansArabic-Regular.ttf", "Noto Sans Arabic"],
      ["NotoSansCJKsc-Regular.ttf",  "Noto Sans CJK SC"],
    );
  }

  for (const [file, family] of fonts) {
    try {
      GlobalFonts.registerFromPath(path.join(fontsDir, file), family);
    } catch (err) {
      console.warn(`[fonts] Could not register "${family}" (${file}):`, err.message);
    }
  }
}

module.exports = { registerFonts };