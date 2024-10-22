const puppeteer = require('puppeteer');
const fs = require('fs').promises;

async function renderCube() {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();

  // Set a smaller viewport for testing to reduce data size
  const dimensions = 512
  const width = dimensions;
  const height = dimensions;
  await page.setViewport({ width, height });

  // Load Three.js library
  await page.evaluate(() => {
    return new Promise((resolve) => {
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
      script.onload = resolve;
      document.head.appendChild(script);
    });
  });

  // Render the scene and extract pixel data
  const pixelData = await page.evaluate(async (width, height) => {
    // Function to set up and render the cube scene
    function setupScene() {
      // Initialize scene
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0xf0f0f0);

      // Initialize camera
      const aspectRatio = 1;
      const viewSize = 10;
      const camera = new THREE.OrthographicCamera(
        -viewSize * aspectRatio / 2,
        viewSize * aspectRatio / 2,
        viewSize / 2,
        -viewSize / 2,
        1,
        1000
      );

      // Randomize camera rotation
      const randomRotationY = (Math.random() * 2 - 1) * Math.PI; // -π to π
      const randomRotationX = (Math.random() - 0.5) * Math.PI;    // -π/2 to π/2

      camera.rotation.order = 'YXZ';
      camera.rotation.y = randomRotationY;
      camera.rotation.x = randomRotationX;

      // Camera position
      const distance = 20;
      const direction = new THREE.Vector3(0, 0, -1);
      direction.applyEuler(camera.rotation);
      camera.position.copy(direction.multiplyScalar(-distance));

      // Initialize renderer
      const renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true
      });
      renderer.setSize(width, height);
      renderer.setPixelRatio(window.devicePixelRatio);
      document.body.appendChild(renderer.domElement);

      // Create cube and add to scene
      const geometry = new THREE.BoxGeometry(2, 2, 2);
      const materials = [
        new THREE.MeshPhongMaterial({ color: 0x00ff00 }),  // Right
        new THREE.MeshPhongMaterial({ color: 0x00dd00 }),  // Left
        new THREE.MeshPhongMaterial({ color: 0x00bb00 }),  // Top
        new THREE.MeshPhongMaterial({ color: 0x009900 }),  // Bottom
        new THREE.MeshPhongMaterial({ color: 0x007700 }),  // Front
        new THREE.MeshPhongMaterial({ color: 0x005500 })   // Back
      ];
      const cubeWithMaterials = new THREE.Mesh(geometry, materials);
      scene.add(cubeWithMaterials);

      // Lighting setup
      const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
      scene.add(ambientLight);

      const frontLight = new THREE.DirectionalLight(0xffffff, 0.7);
      frontLight.position.set(5, 5, 5);
      scene.add(frontLight);

      const sideLight = new THREE.DirectionalLight(0xffffff, 0.4);
      sideLight.position.set(-5, 3, 5);
      scene.add(sideLight);

      const topLight = new THREE.DirectionalLight(0xffffff, 0.3);
      topLight.position.set(0, 8, -5);
      scene.add(topLight);

      return { scene, camera, renderer };
    }

    // Function to extract pixel data from the rendered scene
    function extractPixelData(scene, camera, renderer) {
      // Create a render target with depth texture
      const renderTarget = new THREE.WebGLRenderTarget(width, height);
      renderTarget.texture.format = THREE.RGBAFormat;
      renderTarget.texture.type = THREE.UnsignedByteType;

      // Render the scene normally to get color data
      renderer.setRenderTarget(renderTarget);
      renderer.render(scene, camera);
      renderer.setRenderTarget(null);

      // Read the color data
      const colorPixelBuffer = new Uint8Array(width * height * 4);
      renderer.readRenderTargetPixels(renderTarget, 0, 0, width, height, colorPixelBuffer);

      // Render the scene with a depth material to get depth data
      const depthMaterial = new THREE.MeshDepthMaterial();
      depthMaterial.depthPacking = THREE.RGBADepthPacking;
      depthMaterial.blending = THREE.NoBlending;

      // Replace all materials in the scene with the depth material
      const originalMaterials = [];
      scene.traverse(function (child) {
        if (child.isMesh) {
          originalMaterials.push({ mesh: child, material: child.material });
          child.material = depthMaterial;
        }
      });

      // Render the scene with the depth material
      const depthRenderTarget = new THREE.WebGLRenderTarget(width, height);
      renderer.setRenderTarget(depthRenderTarget);
      renderer.render(scene, camera);
      renderer.setRenderTarget(null);

      // Restore original materials
      originalMaterials.forEach(function (item) {
        item.mesh.material = item.material;
      });

      // Read the depth data
      const depthPixelBuffer = new Uint8Array(width * height * 4);
      renderer.readRenderTargetPixels(depthRenderTarget, 0, 0, width, height, depthPixelBuffer);

      // Function to unpack RGBA depth values
      function unpackRGBADepth(r, g, b, a) {
        const normalized = [r, g, b, a].map(v => v / 255);
        const bitShift = [1 / (256 * 256 * 256), 1 / (256 * 256), 1 / 256, 1];
        return normalized.reduce((sum, v, i) => sum + v * bitShift[i], 0);
      }

      // Combine color and depth data
      const data = [];
      for (let i = 0; i < width * height; i++) {
        const idx = i * 4;
        const r = colorPixelBuffer[idx];
        const g = colorPixelBuffer[idx + 1];
        const b = colorPixelBuffer[idx + 2];
        const a = colorPixelBuffer[idx + 3];

        const dr = depthPixelBuffer[idx];
        const dg = depthPixelBuffer[idx + 1];
        const db = depthPixelBuffer[idx + 2];
        const da = depthPixelBuffer[idx + 3];

        let depth = unpackRGBADepth(dr, dg, db, da);
        if (depth >= 1.0) depth = null; // infinite depth/no object/background will always be greater than or equal to 1.0

        data.push({ r, g, b, a: a / 255, d: depth });
      }

      return data;
    }

    // Set up the scene
    const { scene, camera, renderer } = setupScene();

    // Extract pixel data
    const data = extractPixelData(scene, camera, renderer);

    return data;
  }, width, height);

  // Write the data to a JSON file
  await fs.writeFile('pixels.json', JSON.stringify(pixelData));
  console.log('Pixel data saved to pixels.json');

  await browser.close();
}

renderCube().catch(console.error);
