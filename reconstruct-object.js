const fs = require('fs');
const { PNG } = require('pngjs');

async function reconstructImage() {
  // Read the pixel data from the JSON file
  const pixelData = JSON.parse(await fs.promises.readFile('data.json', 'utf8'));

  // Get image dimensions (ensure these match the dimensions used in your rendering script)
  const dimensions = Math.sqrt(pixelData.length)
  const width = dimensions;
  const height = dimensions;

  // Create a new PNG object
  const png = new PNG({ width, height });

  // Loop over each pixel and set the RGBA values
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4; // Index in the png.data buffer
      const pixelIdx = y * width + x;  // Index in the pixelData array
      const pixel = pixelData[pixelIdx];

      // Set pixel data
      png.data[idx] = pixel.r;         // Red channel
      png.data[idx + 1] = pixel.g;     // Green channel
      png.data[idx + 2] = pixel.b;     // Blue channel
      png.data[idx + 3] = Math.round(pixel.a * 255); // Alpha channel
    }
  }

  // Write the PNG file
  png.pack().pipe(fs.createWriteStream('object_reconstructed.png'))
    .on('finish', () => {
      console.log('Image reconstructed and saved as object_reconstructed.png');
    });
}

async function reconstructDepthMap() {
  const pixelData = JSON.parse(await fs.promises.readFile('data.json', 'utf8'));

  const dimensions = Math.sqrt(pixelData.length)
  const width = dimensions;
  const height = dimensions;

  const png = new PNG({ width, height });

  // Find min and max depth values (excluding nulls)
  const depths = pixelData.map(p => p.d).filter(d => d !== null);
  const minDepth = Math.min(...depths);
  const maxDepth = Math.max(...depths);

  // Loop over each pixel and set the grayscale value based on depth
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const pixelIdx = y * width + x;
      const pixel = pixelData[pixelIdx];

      let depthValue;
      if (pixel.d === null) {
        depthValue = 0; // Background pixels are black
      } else {
        // Normalize depth between minDepth and maxDepth
        depthValue = ((pixel.d - minDepth) / (maxDepth - minDepth)) * 255;
        depthValue = Math.round(depthValue);
      }

      // Set grayscale color
      png.data[idx] = depthValue;
      png.data[idx + 1] = depthValue;
      png.data[idx + 2] = depthValue;
      png.data[idx + 3] = 255; // Fully opaque
    }
  }

  png.pack().pipe(fs.createWriteStream('object_depth_map.png'))
    .on('finish', () => {
      console.log('Depth map saved as object_depth_map.png');
    });
}

(async () => {
  await reconstructImage();
  await reconstructDepthMap();
})().catch(console.error);
