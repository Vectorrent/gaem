const puppeteer = require('puppeteer');
const fs = require('fs').promises;

async function renderCube() {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();

  const dimensions = 512;
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

  const pixelData = await page.evaluate(async (width, height) => {
    function setupScene() {
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0xf0f0f0);

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

      const randomRotationY = (Math.random() * 2 - 1) * Math.PI;
      const randomRotationX = (Math.random() - 0.5) * Math.PI;

      camera.rotation.order = 'YXZ';
      camera.rotation.y = randomRotationY;
      camera.rotation.x = randomRotationX;

      const distance = 20;
      const direction = new THREE.Vector3(0, 0, -1);
      direction.applyEuler(camera.rotation);
      camera.position.copy(direction.multiplyScalar(-distance));

      const renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true
      });
      renderer.setSize(width, height);
      renderer.setPixelRatio(window.devicePixelRatio);
      document.body.appendChild(renderer.domElement);

      const geometry = new THREE.BoxGeometry(2, 2, 2);
      const materials = [
        new THREE.MeshPhongMaterial({ color: 0x00ff00 }),
        new THREE.MeshPhongMaterial({ color: 0x00dd00 }),
        new THREE.MeshPhongMaterial({ color: 0x00bb00 }),
        new THREE.MeshPhongMaterial({ color: 0x009900 }),
        new THREE.MeshPhongMaterial({ color: 0x007700 }),
        new THREE.MeshPhongMaterial({ color: 0x005500 })
      ];
      const cube = new THREE.Mesh(geometry, materials);
      scene.add(cube);

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

      return { scene, camera, renderer, cube };
    }

    function extractPixelData(scene, camera, renderer, cube) {
      // Create render target for color data
      const renderTarget = new THREE.WebGLRenderTarget(width, height);
      renderTarget.texture.format = THREE.RGBAFormat;
      renderTarget.texture.type = THREE.UnsignedByteType;

      // Render the scene to get color data
      renderer.setRenderTarget(renderTarget);
      renderer.render(scene, camera);
      renderer.setRenderTarget(null);

      // Read the color data
      const colorPixelBuffer = new Uint8Array(width * height * 4);
      renderer.readRenderTargetPixels(renderTarget, 0, 0, width, height, colorPixelBuffer);

      // Set up raycaster
      const raycaster = new THREE.Raycaster();
      const mouse = new THREE.Vector2();

      // Calculate camera's near and far planes for depth normalization
      const nearPlane = camera.near;
      const farPlane = camera.far;

      // Create array to store final pixel data
      const data = [];

      // Process each pixel
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const i = (y * width + x) * 4;

          // Get color data
          const r = colorPixelBuffer[i];
          const g = colorPixelBuffer[i + 1];
          const b = colorPixelBuffer[i + 2];
          const a = colorPixelBuffer[i + 3];

          // Calculate normalized device coordinates
          mouse.x = (x / width) * 2 - 1;
          mouse.y = -(y / height) * 2 + 1;

          // Update the raycaster
          raycaster.setFromCamera(mouse, camera);

          // Perform the raycast
          const intersects = raycaster.intersectObject(cube);

          // Calculate depth
          let depth = null;
          if (intersects.length > 0) {
            // Normalize depth between 0 and 1
            depth = (intersects[0].distance - nearPlane) / (farPlane - nearPlane);
          }

          // Store pixel data
          data.push({ r, g, b, a: a / 255, d: depth });
        }
      }

      return data;
    }

    const { scene, camera, renderer, cube } = setupScene();
    const data = extractPixelData(scene, camera, renderer, cube);
    return data;
  }, width, height);

  await fs.writeFile('data.json', JSON.stringify(pixelData));
  console.log('Pixel data saved to data.json');

  await browser.close();
}

renderCube().catch(console.error);