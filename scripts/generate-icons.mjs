import sharp from 'sharp';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const iconsDir = path.join(__dirname, 'public', 'icons');

// Ensure icons directory exists
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

const sizes = [16, 32, 64, 128, 256, 512];
const svgPath = path.join(iconsDir, 'icon.svg');

async function generateIcons() {
  try {
    console.log('🎨 Generating icons from SVG...');
    
    // Generate PNG icons at different sizes
    for (const size of sizes) {
      const outputPath = path.join(iconsDir, `icon-${size}x${size}.png`);
      
      await sharp(svgPath)
        .resize(size, size, {
          fit: 'contain',
          background: { r: 0, g: 0, b: 0, alpha: 0 }
        })
        .png()
        .toFile(outputPath);
      
      console.log(`✓ Generated ${size}x${size} icon`);
    }

    // Generate favicon (32x32)
    await sharp(svgPath)
      .resize(32, 32, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      })
      .png()
      .toFile(path.join(iconsDir, 'favicon.png'));
    
    console.log('✓ Generated favicon');

    // Generate ICO file (Windows) - using 256x256 as base
    await sharp(svgPath)
      .resize(256, 256, {
        fit: 'contain',
        background: { r: 30, g: 58, b: 138, alpha: 1 } // Dark blue background
      })
      .toFormat('png')
      .toFile(path.join(iconsDir, 'icon.png'));
    
    console.log('✓ Generated icon.png (256x256)');
    console.log('✅ All icons generated successfully!');
    console.log('\nNote: For Windows .ico file, use an online converter:');
    console.log('https://icoconvert.com/ or similar tools');
    
  } catch (error) {
    console.error('❌ Error generating icons:', error);
    process.exit(1);
  }
}

generateIcons();
