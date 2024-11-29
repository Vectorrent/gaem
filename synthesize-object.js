const fs = require('fs').promises;

// Parse command-line arguments
const args = process.argv.slice(2);
const argObj = {
  workDir: 'data',
  saveName: 'synthetic',
  x: Math.random() * 180,
  y: Math.random() * 360,
  z: Math.random() * 360
};

args.forEach(arg => {
  const [key, value] = arg.split('=');
  const isNumber = !isNaN(value) && !isNaN(parseFloat(value));
  argObj[key] = isNumber ? parseFloat(value) : value;
});

const sampleAngles = [
  { name: 'angle1', x: 30, y: 60, z: 90 },
  { name: 'angle2', x: 90, y: 30, z: 60 },
  { name: 'angle3', x: 0, y: 20, z: 180 },
  { name: 'angle4', x: 30, y: 60, z: 0 },
  { name: 'angle5', x: 30, y: 0, z: 0 },
  { name: 'angle6', x: 0, y: 0, z: 0 }
];

const BACKGROUND_COLOR = { r: 0xf0, g: 0xf0, b: 0xf0, a: 1 };
const WIDTH = 512;
const HEIGHT = 512;

function calculateAngularDistance(angle1, angle2) {
  const dx = Math.min(Math.abs(angle1.x - angle2.x), 180 - Math.abs(angle1.x - angle2.x));
  const dy = Math.min(Math.abs(angle1.y - angle2.y), 360 - Math.abs(angle1.y - angle2.y));
  const dz = Math.min(Math.abs(angle1.z - angle2.z), 360 - Math.abs(angle1.z - angle2.z));
  
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function calculateWeightedDistance(target, sample) {
  // Weight x and y more heavily than z since they affect face visibility
  const WEIGHTS = { x: 2.0, y: 2.0, z: 1.0 };
  
  // Calculate directional differences
  const dx = Math.min(Math.abs(target.x - sample.x), 180 - Math.abs(target.x - sample.x));
  const dy = Math.min(Math.abs(target.y - sample.y), 360 - Math.abs(target.y - sample.y));
  const dz = Math.min(Math.abs(target.z - sample.z), 360 - Math.abs(target.z - sample.z));
  
  // Apply dimensional weights and calculate weighted distance
  return Math.sqrt(
    (dx * dx * WEIGHTS.x) + 
    (dy * dy * WEIGHTS.y) + 
    (dz * dz * WEIGHTS.z)
  );
}

function getTripleBlendingWeights(targetAngle, sampleAngles) {
  // Calculate weighted distances to target angle
  const distances = sampleAngles.map(angle => ({
    ...angle,
    distance: calculateWeightedDistance(targetAngle, angle)
  }));
  
  // Get three closest angles
  const closest = distances
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 3);
  
  // Calculate weights using exponential falloff
  const FALLOFF = 0.1; // Smaller value = more aggressive falloff
  const weights = closest.map(angle => ({
    ...angle,
    weight: Math.exp(-angle.distance * FALLOFF)
  }));
  
  // Normalize weights
  const totalWeight = weights.reduce((sum, w) => sum + w.weight, 0);
  const normalized = weights.map(w => ({
    ...w,
    weight: w.weight / totalWeight
  }));
  
  // Log selection and weights
  console.log('\nSelected sample views:');
  closest.forEach((view, i) => {
    console.log(`Sample ${i + 1}: ${view.name}`);
    console.log(`  Angles: x=${view.x}°, y=${view.y}°, z=${view.z}°`);
    console.log(`  Weighted distance: ${view.distance.toFixed(2)}°`);
  });
  
  console.log('\nBlending weights:');
  normalized.forEach(view => {
    console.log(`${view.name}: ${(view.weight * 100).toFixed(1)}%`);
  });
  
  return normalized;
}

function interpolatePixel(samples, weights) {
  if (samples.every(s => s.d === null)) {
    return { ...BACKGROUND_COLOR, d: null };
  }
  
  // Get valid samples
  const validSamples = samples.filter(s => s.d !== null);
  if (validSamples.length === 0) {
    return { ...BACKGROUND_COLOR, d: null };
  }
  
  // Find dominant sample (highest weight * closest depth)
  const dominantSample = validSamples.reduce((best, current, idx) => {
    const score = weights[idx].weight * (1 - current.d);
    return score > best.score ? { sample: current, score } : best;
  }, { sample: validSamples[0], score: weights[0].weight * (1 - validSamples[0].d) });
  
  // Use dominant sample's color but blend depth
  const result = {
    r: dominantSample.sample.r,
    g: dominantSample.sample.g,
    b: dominantSample.sample.b,
    a: 1,
    d: 0
  };
  
  // Blend depths using weights
  let totalWeight = 0;
  validSamples.forEach((sample, idx) => {
    result.d += sample.d * weights[idx].weight;
    totalWeight += weights[idx].weight;
  });
  result.d /= totalWeight;
  
  return result;
}

async function synthesizeView(argObj) {
  // Calculate weights for three closest views
  const blendWeights = getTripleBlendingWeights(argObj, sampleAngles);
  
  // Load sample data
  const samplesData = await Promise.all(
    blendWeights.map(view => 
      fs.readFile(`${argObj.workDir}/${view.name}.json`, 'utf8')
        .then(JSON.parse)
    )
  );
  
  // Log target angles
  console.log('\nTarget view angles:');
  console.log(`x=${argObj.x}°, y=${argObj.y}°, z=${argObj.z}°`);
  
  // Create synthetic view
  const syntheticData = new Array(WIDTH * HEIGHT);
  
  // Track interpolation statistics
  let backgroundPixels = 0;
  let interpolatedPixels = 0;
  let singleSourcePixels = 0;
  
  for (let i = 0; i < WIDTH * HEIGHT; i++) {
    const samples = samplesData.map(data => data[i]);
    
    if (samples.every(s => s.d === null)) {
      backgroundPixels++;
      syntheticData[i] = { ...BACKGROUND_COLOR, d: null };
      continue;
    }
    
    const validSamples = samples.filter(s => s.d !== null);
    if (validSamples.length === 1) {
      singleSourcePixels++;
      syntheticData[i] = { ...validSamples[0] };
      continue;
    }
    
    interpolatedPixels++;
    syntheticData[i] = interpolatePixel(samples, blendWeights);
  }
  
  // Log statistics
  console.log('\nInterpolation statistics:');
  console.log(`Background pixels: ${((backgroundPixels / (WIDTH * HEIGHT)) * 100).toFixed(1)}%`);
  console.log(`Interpolated pixels: ${((interpolatedPixels / (WIDTH * HEIGHT)) * 100).toFixed(1)}%`);
  console.log(`Single source pixels: ${((singleSourcePixels / (WIDTH * HEIGHT)) * 100).toFixed(1)}%`);
  
  const outputFile = `${argObj.workDir}/${argObj.saveName}.json`;
  await fs.writeFile(outputFile, JSON.stringify(syntheticData));
  console.log(`\nSynthetic view saved to ${outputFile}`);
}

synthesizeView(argObj).catch(console.error);