const puppeteer = require('puppeteer');
const fs = require('fs').promises;

async function renderCube() {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();

  await page.setViewport({ width: 1024, height: 1024 });

  await page.evaluate(() => {
    return new Promise((resolve) => {
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
      script.onload = resolve;
      document.head.appendChild(script);
    });
  });

  await page.evaluate(() => {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf0f0f0);

    // Set up true isometric camera
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

    // True isometric angle setup (equal angles between all axes)
    const isometricAngle = Math.atan(1 / Math.sqrt(2)); // Approximately 35.264 degrees

    // Remove lookAt and set rotation directly
    camera.rotation.order = 'YXZ';
    camera.rotation.y = -Math.PI / 4;  // -45 degrees around Y-axis
    camera.rotation.x = isometricAngle; // 35.264 degrees around X-axis

    // Position the camera along the direction it's facing
    const distance = 20;
    const direction = new THREE.Vector3(0, 0, -1);
    direction.applyEuler(camera.rotation);
    camera.position.copy(direction.multiplyScalar(-distance));

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true
    });
    renderer.setSize(1024, 1024);
    renderer.setPixelRatio(window.devicePixelRatio);
    document.body.appendChild(renderer.domElement);

    // Create cube
    const geometry = new THREE.BoxGeometry(2, 2, 2);

    // Create materials for each face of the cube for better distinction
    const materials = [
      new THREE.MeshPhongMaterial({ color: 0x00ff00 }),  // Right
      new THREE.MeshPhongMaterial({ color: 0x00dd00 }),  // Left
      new THREE.MeshPhongMaterial({ color: 0x00bb00 }),  // Top
      new THREE.MeshPhongMaterial({ color: 0x009900 }),  // Bottom
      new THREE.MeshPhongMaterial({ color: 0x007700 }),  // Front
      new THREE.MeshPhongMaterial({ color: 0x005500 })   // Back
    ];

    // Create cube with different colored faces
    const cubeWithMaterials = new THREE.Mesh(geometry, materials);
    scene.add(cubeWithMaterials);

    // Lighting setup
    // Ambient light for overall illumination
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);

    // Three-point lighting setup for better depth
    const frontLight = new THREE.DirectionalLight(0xffffff, 0.7);
    frontLight.position.set(5, 5, 5);
    scene.add(frontLight);

    const sideLight = new THREE.DirectionalLight(0xffffff, 0.4);
    sideLight.position.set(-5, 3, 5);
    scene.add(sideLight);

    const topLight = new THREE.DirectionalLight(0xffffff, 0.3);
    topLight.position.set(0, 8, -5);
    scene.add(topLight);

    renderer.render(scene, camera);
  });

  const screenshot = await page.screenshot({ type: 'png' });
  await fs.writeFile('cube.png', screenshot);
  console.log('Image saved as cube.png');

  await browser.close();
}

renderCube().catch(console.error);