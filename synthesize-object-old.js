// synthesize-object.js
const fs = require('fs').promises;

// Parse command-line arguments
const args = process.argv.slice(2);
const argObj = {
  workDir: 'data',
  saveName: 'synthesized',
};
args.forEach((arg) => {
  const [key, value] = arg.split('=');
  const isNumber = !isNaN(value) && !isNaN(parseFloat(value));
  argObj[key] = isNumber ? parseFloat(value) : value;
});

// Global constants matching the original rendering code
const width = 512;
const height = 512;
const viewSize = 10;
const aspectRatio = 1; // Assuming square viewport
const left = (-viewSize * aspectRatio) / 2;
const right = (viewSize * aspectRatio) / 2;
const top = viewSize / 2;
const bottom = -viewSize / 2;
const nearPlane = 1;
const farPlane = 1000;

// Helper functions for vector operations
function dot(a, b) {
  return a.reduce((sum, ai, i) => sum + ai * b[i], 0);
}

function cross(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function norm(v) {
  return Math.hypot(...v);
}

function normalize(v) {
  const len = norm(v);
  if (len === 0) return [0, 0, 0];
  return v.map((x) => x / len);
}

function subtractVectors(a, b) {
  return a.map((val, idx) => val - b[idx]);
}

function addVectors(a, b) {
  return a.map((val, idx) => val + b[idx]);
}

function multiplyVectorByScalar(v, scalar) {
  return v.map((val) => val * scalar);
}

function multiplyMatrixVector(matrix, vector) {
  return [
    dot(matrix[0], vector),
    dot(matrix[1], vector),
    dot(matrix[2], vector),
  ];
}

// Function to compute the view matrix of a camera
function computeViewMatrix(camera) {
  const { position, right, up, forward } = camera;

  // Create rotation matrix
  const rotation = [
    right,
    up,
    forward.map((v) => -v),
  ];

  // Compute translation (negative position)
  const negativePosition = position.map((v) => -v);

  return {
    rotation,
    position: negativePosition,
  };
}

// Function to create a camera object with position and orientation
function createCamera(xDeg, yDeg, zDeg, distance = 20) {
  const degToRad = (degrees) => (degrees * Math.PI) / 180;
  const theta = degToRad(yDeg % 360); // Azimuthal angle
  let phi = degToRad(xDeg % 360); // Polar angle

  // Avoid singularities at the poles
  const epsilon = 0.0001;
  phi = Math.max(epsilon, Math.min(Math.PI - epsilon, phi));

  // Calculate camera position in spherical coordinates
  const x = distance * Math.sin(phi) * Math.cos(theta);
  const z = distance * Math.sin(phi) * Math.sin(theta); // Swap y and z to match Three.js coordinate system
  const y = distance * Math.cos(phi);

  // Camera orientation (looking at the origin)
  const forward = normalize([-x, -y, -z]); // Pointing towards the origin
  const worldUp = [0, 1, 0]; // World up vector matches Three.js default

  // Compute right and up vectors
  let right = normalize(cross(forward, worldUp));
  let up = cross(right, forward);

  // Apply roll (z rotation)
  const roll = degToRad(zDeg % 360);
  const cosRoll = Math.cos(roll);
  const sinRoll = Math.sin(roll);

  const rotatedRight = [
    right[0] * cosRoll - up[0] * sinRoll,
    right[1] * cosRoll - up[1] * sinRoll,
    right[2] * cosRoll - up[2] * sinRoll,
  ];

  const rotatedUp = [
    right[0] * sinRoll + up[0] * cosRoll,
    right[1] * sinRoll + up[1] * cosRoll,
    right[2] * sinRoll + up[2] * cosRoll,
  ];

  return {
    position: [x, y, z],
    forward,
    up: rotatedUp,
    right: rotatedRight,
  };
}

// Main synthesis function
async function synthesizeObject(argObj) {
  // Define existing samples with their camera angles
  const samples = [
    { x: 30, y: 60, z: 90, saveName: 'angle1' },
    { x: 90, y: 30, z: 60, saveName: 'angle2' },
    { x: 0, y: 20, z: 180, saveName: 'angle3' },
    { x: 30, y: 60, z: 0, saveName: 'angle4' },
    { x: 30, y: 0, z: 0, saveName: 'angle5' },
    { x: 90, y: 0, z: 0, saveName: 'angle6' },
  ];

  // Read the pixel data for each sample
  const samplesDir = argObj.workDir || 'data';
  for (const sample of samples) {
    const file = `${samplesDir}/${sample.saveName}.json`;
    const data = await fs.readFile(file, 'utf8');
    sample.pixelData = JSON.parse(data);
    sample.camera = createCamera(sample.x, sample.y, sample.z);
  }

  // Create the new camera
  const newCamera = createCamera(argObj.x || 0, argObj.y || 0, argObj.z || 0);

  // Compute angular distances and select closest samples
  for (const sample of samples) {
    const angleDist = computeAngularDistance(
      newCamera.forward,
      sample.camera.forward
    );
    sample.angularDistance = angleDist;
  }

  // Sort samples by angular distance
  samples.sort((a, b) => a.angularDistance - b.angularDistance);

  // Select the closest three samples
  const closestSamples = samples.slice(0, 3);

  // Print names of the closest samples
  console.log('Using the following closest samples:');
  closestSamples.forEach((sample, index) => {
    console.log(
      `${index + 1}. ${sample.saveName} (Angle x=${sample.x}, y=${sample.y}, z=${sample.z})`
    );
  });

  // Prepare an empty buffer for the synthesized image
  const synthesizedImage = new Array(width * height).fill(null);

  // Initialize Z-buffer
  const zBuffer = new Array(width * height).fill(Infinity);

  // For each of the closest samples, project their pixels into the new view
  for (const sample of closestSamples) {
    const camera = sample.camera;

    // Compute weight based on angular distance
    const weight = 1 / (sample.angularDistance + 1e-6);

    // For each pixel in the sample
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        const pixel = sample.pixelData[idx];
        if (pixel.d === null || isNaN(pixel.d)) continue;

        // Reconstruct the 3D point in world coordinates
        const depth = pixel.d; // Depth normalized between 0 and 1
        const ndcX = (x / (width - 1)) * 2 - 1;
        const ndcY = 1 - (y / (height - 1)) * 2; // Invert Y-axis

        // Map NDC to camera space
        const camX = ndcX * ((right - left) / 2);
        const camY = ndcY * ((top - bottom) / 2);
        const camZ = - (depth * (farPlane - nearPlane) + nearPlane);

        const pointCameraSpace = [camX, camY, camZ];

        // Transform to world space
        const pointWorldSpace = cameraToWorldSpace(pointCameraSpace, camera);

        // Transform to new camera space
        const pointNewCameraSpace = worldToCameraSpace(pointWorldSpace, newCamera);

        // Project onto new image plane
        const ndcNewX = pointNewCameraSpace[0] / ((right - left) / 2);
        const ndcNewY = pointNewCameraSpace[1] / ((top - bottom) / 2);

        // Check if point is within NDC cube
        if (ndcNewX < -1 || ndcNewX > 1 || ndcNewY < -1 || ndcNewY > 1) continue;

        // Convert NDC to pixel coordinates
        const u = ((ndcNewX + 1) / 2) * (width - 1);
        const v = ((1 - ndcNewY) / 2) * (height - 1);

        const xi = Math.round(u);
        const yi = Math.round(v);

        if (xi < 0 || xi >= width || yi < 0 || yi >= height) continue;

        const newIdx = yi * width + xi;

        // Depth normalization for Z-buffering
        const depthNew = -pointNewCameraSpace[2];

        // Z-buffering to handle occlusions
        if (depthNew < zBuffer[newIdx]) {
          zBuffer[newIdx] = depthNew;

          // Initialize pixel data
          synthesizedImage[newIdx] = {
            r: pixel.r * weight,
            g: pixel.g * weight,
            b: pixel.b * weight,
            a: pixel.a * weight,
            weight: weight,
          };
        } else if (depthNew === zBuffer[newIdx]) {
          // Accumulate colors and weights
          if (synthesizedImage[newIdx]) {
            synthesizedImage[newIdx].r += pixel.r * weight;
            synthesizedImage[newIdx].g += pixel.g * weight;
            synthesizedImage[newIdx].b += pixel.b * weight;
            synthesizedImage[newIdx].a += pixel.a * weight;
            synthesizedImage[newIdx].weight += weight;
          }
        }
      }
    }
  }

  // Normalize colors by weights
  const outputPixelData = synthesizedImage.map((pixel) => {
    if (pixel === null || pixel.weight === 0) {
      return { r: 0, g: 0, b: 0, a: 0, d: null };
    } else {
      return {
        r: pixel.r / pixel.weight,
        g: pixel.g / pixel.weight,
        b: pixel.b / pixel.weight,
        a: pixel.a / pixel.weight,
        d: zBuffer[synthesizedImage.indexOf(pixel)],
      };
    }
  });

  // Ensure the directory exists
  await fs.mkdir(argObj.workDir, { recursive: true });

  const file = argObj.workDir + '/' + argObj.saveName + '.json';
  await fs.writeFile(file, JSON.stringify(outputPixelData));
  console.log(`Synthesized pixel data saved to ${file}`);
}

// Helper functions for coordinate transformations

function computeAngularDistance(vec1, vec2) {
  const dotProd = dot(vec1, vec2);
  const angle = Math.acos(
    Math.min(Math.max(dotProd / (norm(vec1) * norm(vec2)), -1), 1) // Clamp value between -1 and 1
  );
  return angle;
}

function cameraToWorldSpace(point, camera) {
  const { position, right, up, forward } = camera;
  const rotation = [right, up, forward.map((v) => -v)];

  // Rotate point
  const rotatedPoint = multiplyMatrixVector(rotation, point);

  // Translate point
  const worldPoint = addVectors(rotatedPoint, position);

  return worldPoint;
}

function worldToCameraSpace(point, camera) {
  const { position, right, up, forward } = camera;

  // Translate point
  const translatedPoint = subtractVectors(point, position);

  // Build rotation matrix (transpose of camera rotation matrix)
  const rotation = [
    [right[0], up[0], -forward[0]],
    [right[1], up[1], -forward[1]],
    [right[2], up[2], -forward[2]],
  ];

  // Rotate point
  const cameraPoint = [
    dot(rotation[0], translatedPoint),
    dot(rotation[1], translatedPoint),
    dot(rotation[2], translatedPoint),
  ];

  return cameraPoint;
}

synthesizeObject(argObj).catch(console.error);
