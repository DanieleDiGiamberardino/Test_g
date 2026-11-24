import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export class ShipScene {
  constructor(container) {
    this.container = container;
    this.speedMultiplier = 1;
    this.damageFlash = 0;
    this.clock = new THREE.Clock();

    this.initScene();
    this.initLights();
    this.initStarfield();
    this.buildShip();

    window.addEventListener('resize', () => this.onResize());
    this.animate();
  }

  initScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x050810);
    this.scene.fog = new THREE.FogExp2(0x050810, 0.015);

    this.camera = new THREE.PerspectiveCamera(
      50,
      window.innerWidth / window.innerHeight,
      0.1,
      200
    );
    this.camera.position.set(5.5, 3.2, 6.5);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.container.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.06;
    this.controls.minDistance = 4;
    this.controls.maxDistance = 16;
  }

  initLights() {
    const ambient = new THREE.AmbientLight(0x334155, 1.4);
    this.scene.add(ambient);

    // Luce principale "solare" fredda
    const keyLight = new THREE.DirectionalLight(0xe0f2fe, 2.5);
    keyLight.position.set(8, 10, 6);
    this.scene.add(keyLight);

    // Rim light arancione (stile industriale/relitto)
    const rimLight = new THREE.DirectionalLight(0xf59e0b, 1.5);
    rimLight.position.set(-8, -4, -6);
    this.scene.add(rimLight);

    // Luce rossa per quando la nave subisce danni
    this.damageLight = new THREE.PointLight(0xef4444, 0, 12);
    this.damageLight.position.set(0, 2, 2);
    this.scene.add(this.damageLight);
  }

  initStarfield() {
    const count = 900;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 60;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 40;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 80;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const mat = new THREE.PointsMaterial({
      color: 0xcbd5e1,
      size: 0.12,
      transparent: true,
      opacity: 0.85,
    });

    this.stars = new THREE.Points(geo, mat);
    this.scene.add(this.stars);
  }

  buildShip() {
    this.shipGroup = new THREE.Group();
    this.scene.add(this.shipGroup);

    // Materiali base
    const hullMat = new THREE.MeshStandardMaterial({
      color: 0x475569,
      roughness: 0.6,
      metalness: 0.7,
    });
    const darkMetal = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.5,
      metalness: 0.8,
    });
    const hazardMat = new THREE.MeshStandardMaterial({
      color: 0xd97706,
      roughness: 0.4,
      metalness: 0.3,
    });
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x0284c7,
      emissiveIntensity: 0.8,
      roughness: 0.1,
      metalness: 0.9,
    });

    // 1. Corpo centrale (scafo industriale)
    const fuselage = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.1, 3.4), hullMat);
    this.shipGroup.add(fuselage);

    // Fascia arancione industriale
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.66, 0.25, 0.9), hazardMat);
    stripe.position.set(0, 0.1, 0.3);
    this.shipGroup.add(stripe);

    // 2. Cabina di pilotaggio (prua verso -Z)
    const cockpit = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.65, 1.1), darkMetal);
    cockpit.position.set(0, 0.45, -1.3);
    this.shipGroup.add(cockpit);

    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.35, 0.5), glassMat);
    visor.position.set(0, 0.5, -1.68);
    this.shipGroup.add(visor);

    // 3. Alette stabilizzatrici
    const wingGeo = new THREE.BoxGeometry(3.2, 0.14, 1.0);
    const wings = new THREE.Mesh(wingGeo, darkMetal);
    wings.position.set(0, -0.2, 0.8);
    this.shipGroup.add(wings);

    // 4. Motori posteriori (verso +Z)
    this.flames = [];
    const nozzleGeo = new THREE.CylinderGeometry(0.28, 0.38, 0.6, 12);
    nozzleGeo.rotateX(Math.PI / 2);

    const flameGeo = new THREE.ConeGeometry(0.26, 1.5, 12);
    flameGeo.rotateX(Math.PI / 2);
    const flameMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.85,
    });

    [-0.48, 0.48].forEach((xOffset) => {
      const nozzle = new THREE.Mesh(nozzleGeo, darkMetal);
      nozzle.position.set(xOffset, 0, 1.9);
      this.shipGroup.add(nozzle);

      const flame = new THREE.Mesh(flameGeo, flameMat);
      flame.position.set(xOffset, 0, 2.8);
      this.shipGroup.add(flame);
      this.flames.push(flame);
    });

    this.engineLight = new THREE.PointLight(0x38bdf8, 2, 6);
    this.engineLight.position.set(0, 0, 2.8);
    this.shipGroup.add(this.engineLight);

    // --- COSTRUZIONE MODULI 3D (inizialmente nascosti) ---
    this.modules = {};
    this.buildModules(darkMetal, hazardMat);
  }

  buildModules(darkMetal, hazardMat) {
    // MODULO 1: Trivella Laser (Prua)
    const drillGroup = new THREE.Group();
    const mount = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.5, 0.7), darkMetal);
    mount.position.set(0, -0.1, -2.0);
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(0.32, 1.1, 8).rotateX(-Math.PI / 2),
      hazardMat
    );
    cone.position.set(0, -0.1, -2.8);
    const laserTip = new THREE.Mesh(
      new THREE.SphereGeometry(0.12, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xf59e0b })
    );
    laserTip.position.set(0, -0.1, -3.35);
    drillGroup.add(mount, cone, laserTip);
    drillGroup.visible = false;
    this.shipGroup.add(drillGroup);
    this.modules.drill = drillGroup;

    // MODULO 2: Serbatoi Extra (Fiancate)
    const tanksGroup = new THREE.Group();
    const tankGeo = new THREE.CylinderGeometry(0.32, 0.32, 2.0, 12);
    tankGeo.rotateX(Math.PI / 2);
    [-1.15, 1.15].forEach((x) => {
      const tank = new THREE.Mesh(tankGeo, hazardMat);
      tank.position.set(x, 0.1, -0.1);
      const clamp = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.3, 0.4), darkMetal);
      clamp.position.set(x * 0.85, 0.1, -0.1);
      tanksGroup.add(tank, clamp);
    });
    tanksGroup.visible = false;
    this.shipGroup.add(tanksGroup);
    this.modules.tanks = tanksGroup;

    // MODULO 3: Scanner Profondo (Dorso - rotante)
    const scannerGroup = new THREE.Group();
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.35, 0.3, 10), darkMetal);
    base.position.set(0, 0.7, 0.5);
    this.radarDish = new THREE.Group();
    this.radarDish.position.set(0, 1.05, 0.5);
    const dish = new THREE.Mesh(
      new THREE.CylinderGeometry(0.55, 0.1, 0.25, 12).rotateX(Math.PI / 3),
      new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.8, roughness: 0.2 })
    );
    const beacon = new THREE.Mesh(
      new THREE.SphereGeometry(0.08),
      new THREE.MeshBasicMaterial({ color: 0x22c55e })
    );
    beacon.position.set(0, 0.25, -0.2);
    this.radarDish.add(dish, beacon);
    scannerGroup.add(base, this.radarDish);
    scannerGroup.visible = false;
    this.shipGroup.add(scannerGroup);
    this.modules.scanner = scannerGroup;

    // MODULO 4: Scudo Deflettore (Cupola olografica)
    const shieldGeo = new THREE.IcosahedronGeometry(2.7, 2);
    const shieldMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      wireframe: true,
      transparent: true,
      opacity: 0.22,
    });
    const shieldMesh = new THREE.Mesh(shieldGeo, shieldMat);
    shieldMesh.scale.set(0.85, 0.65, 1.25);
    shieldMesh.visible = false;
    this.shipGroup.add(shieldMesh);
    this.modules.shield = shieldMesh;
  }

  // Metodi pubblici chiamati dal gioco / UI
  setModuleActive(modName, isActive) {
    if (this.modules[modName]) {
      this.modules[modName].visible = isActive;
    }
  }

  setSpeed(mult) {
    this.speedMultiplier = mult;
  }

  triggerDamage() {
    this.damageFlash = 1.0;
  }

  animate() {
    requestAnimationFrame(() => this.animate());
    const delta = this.clock.getDelta();
    const elapsed = this.clock.getElapsedTime();

    // 1. Movimento leggero di "galleggiamento" nello spazio
    this.shipGroup.position.y = Math.sin(elapsed * 1.8) * 0.12;
    this.shipGroup.rotation.z = Math.sin(elapsed * 1.1) * 0.04;

    // 2. Effetto scossa e luce rossa se colpita
    if (this.damageFlash > 0) {
      this.damageFlash = Math.max(0, this.damageFlash - delta * 2.5);
      this.damageLight.intensity = this.damageFlash * 12;
      this.shipGroup.position.x = (Math.random() - 0.5) * 0.25 * this.damageFlash;
    } else {
      this.damageLight.intensity = 0;
      this.shipGroup.position.x = 0;
    }

    // 3. Animazione fiamme motori
    const isMoving = this.speedMultiplier > 0;
    const flicker = 0.85 + Math.random() * 0.35;
    this.flames.forEach((flame) => {
      flame.visible = isMoving;
      if (isMoving) {
        const lengthScale = (0.6 + this.speedMultiplier * 0.45) * flicker;
        flame.scale.set(1, 1, lengthScale);
      }
    });
    this.engineLight.intensity = isMoving ? (1.5 + this.speedMultiplier * 0.8) * flicker : 0;

    // 4. Animazione moduli attivi (radar che gira, scudo che pulsa)
    if (this.modules.scanner.visible) {
      this.radarDish.rotation.y += delta * 2.2;
    }
    if (this.modules.shield.visible) {
      this.modules.shield.rotation.y -= delta * 0.25;
      this.modules.shield.material.opacity = 0.16 + Math.sin(elapsed * 3) * 0.06;
    }

    // 5. Movimento campo stellare verso +Z (la nave punta verso -Z)
    if (isMoving) {
      const pos = this.stars.geometry.attributes.position;
      const starSpeed = 8 * this.speedMultiplier * delta;
      for (let i = 0; i < pos.count; i++) {
        let z = pos.getZ(i) + starSpeed;
        if (z > 30) z = -50;
        pos.setZ(i, z);
      }
      pos.needsUpdate = true;
    }

    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }
}