const sharp = require('sharp');
const fs = require('fs');

async function generateAssets() {
  if (!fs.existsSync('assets')) {
    fs.mkdirSync('assets');
  }

  const iconSvg = `
    <svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
      <rect width="1024" height="1024" fill="#0f172a" />
      <g transform="translate(262, 262) scale(25)">
        <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" fill="none" stroke="#38bdf8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </g>
      <text x="512" y="800" font-family="sans-serif" font-size="80" font-weight="bold" fill="#ffffff" text-anchor="middle">OmniPortal</text>
    </svg>
  `;

  const splashSvg = `
    <svg width="2732" height="2732" viewBox="0 0 2732 2732" xmlns="http://www.w3.org/2000/svg">
      <rect width="2732" height="2732" fill="#0f172a" />
      <g transform="translate(1116, 1116) scale(25)">
        <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" fill="none" stroke="#38bdf8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </g>
      <text x="1366" y="1800" font-family="sans-serif" font-size="120" font-weight="bold" fill="#ffffff" text-anchor="middle">MPT OmniPortal</text>
    </svg>
  `;

  await sharp(Buffer.from(iconSvg))
    .png()
    .toFile('assets/icon.png');
    
  await sharp(Buffer.from(splashSvg))
    .png()
    .toFile('assets/splash.png');

  console.log('Assets generated successfully!');
}

generateAssets().catch(console.error);
