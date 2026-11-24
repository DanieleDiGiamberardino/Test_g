import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export class ShipScene {
  constructor(container) {
    this.container = container;
    this.speedMultiplier = 0;
    this.damageFlash = 0;
    this.clock = new THREE.Clock();

    this.initScene();
    this.initLights();
    this.initStarfield();
    this.initDebrisField();
    this.buildShip();
    this.initEngineParticles();

    window.addEventListener('resize', () => this.onResize());
    this.animate();
  }

  initScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x04070e);
    this.scene.fog = new THREE.FogExp2(0x04070e, 0.014);

    this.camera = new THREE.PerspectiveCamera(
      48,
      window.innerWidth / window.innerHeight,
      0.1,
      250
    );
    this.camera.position.set(6.2, 3.4, 7.2);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.container.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.06;
    this.controls.minDistance = 4.5;
    this.controls.maxDistance = 18;
  }

  initLights() {
    // Luce ambientale bicolore (spazio freddo sopra, riflesso caldo sotto)
    const hemi = new THREE.HemisphereLight(0x7dd3fc, 0x1e293b, 0.9);
    this.scene.add(hemi);

    // Luce solare principale
    const keyLight = new THREE.DirectionalLight(0xf0f9ff, 2.6);
    keyLight.position.set(10, 12, 8);
    this.scene.add(keyLight);

    // Controluce industriale arancione per staccare i profili dello scafo
    const rimLight = new THREE.DirectionalLight(0xf59e0b, 1.8);
    rimLight.position.set(-10, -5, -8);
    this.scene.add(rimLight);

    // Luce rossa di allarme per gli impatti
    this.damageLight = new THREE.PointLight(0xef4444, 0, 15);
    this.damageLight.position.set(0, 2.5, 2);
    this.scene.add(this.damageLight);
  }

  initStarfield() {
    const count = 1200;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const palette = [
      new THREE.Color(0xe2e8f0),
      new THREE.Color(0x93c5fd),
      new THREE.Color(0xfde68a),
    ];

    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 90;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 60;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 120;

      const c = palette[Math.floor(Math.random() * palette.length)];
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const mat = new THREE.PointsMaterial({
      size: 0.14,
      vertexColors: true,
      transparent: true,
      opacity: 0.85,
    });

    this.stars = new THREE.Points(geo, mat);
    this.scene.add(this.stars);
  }

  initDebrisField() {
    this.debrisGroup = new THREE.Group();
    this.debrisItems = [];

    const rockGeo = new THREE.DodecahedronGeometry(1, 0);
    const rockMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      roughness: 0.9,
      metalness: 0.25,
      flatShading: true,
    });
    const scrapMat = new THREE.MeshStandardMaterial({
      color: 0x475569,
      roughness: 0.55,
      metalness: 0.75,
      flatShading: true,
    });

    for (let i = 0; i < 26; i++) {
      const isMetal = Math.random() > 0.7;
      const mesh = new THREE.Mesh(rockGeo, isMetal ? scrapMat : rockMat);
      const scale = 0.2 + Math.random() * 0.75;
      mesh.scale.set(
        scale * (0.7 + Math.random() * 0.6),
        scale * (0.7 + Math.random() * 0.6),
        scale * (0.7 + Math.random() * 0.6)
      );

      this.placeDebris(mesh, true);
      this.debrisGroup.add(mesh);
      this.debrisItems.push({
        mesh,
        rotX: (Math.random() - 0.5) * 1.2,
        rotY: (Math.random() - 0.5) * 1.2,
        speedFactor: 0.8 + Math.random() * 0.7,
      });
    }

    this.scene.add(this.debrisGroup);
  }

  placeDebris(mesh, randomZ = false) {
    // Mantiene un corridoio libero intorno alla nave per evitare compenetrazioni
    let x, y;
    do {
      x = (Math.random() - 0.5) * 44;
      y = (Math.random() - 0.5) * 28;
    } while (Math.hypot(x, y) < 6.2);

    mesh.position.set(x, y, randomZ ? (Math.random() - 0.5) * 90 : -55 - Math.random() * 25);
  }

  buildShip() {
    this.shipGroup = new THREE.Group();
    this.scene.add(this.shipGroup);

    // Palette materiali industriali
    const hullPrimary = new THREE.MeshStandardMaterial({
      color: 0x526277,
      roughness: 0.48,
      metalness: 0.72,
    });
    const hullArmor = new THREE.MeshStandardMaterial({
      color: 0x2a3547,
      roughness: 0.55,
      metalness: 0.82,
    });
    const frameDark = new THREE.MeshStandardMaterial({
      color: 0x131b29,
      roughness: 0.6,
      metalness: 0.85,
    });
    const hazardOrange = new THREE.MeshStandardMaterial({
      color: 0xea580c,
      roughness: 0.4,
      metalness: 0.35,
    });
    const cockpitGlass = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x0284c7,
      emissiveIntensity: 1.1,
      roughness: 0.1,
      metalness: 0.95,
    });

    // === 1. FUSOLIERA CENTRALE CORAZZATA ===
    const coreHull = new THREE.Mesh(new THREE.BoxGeometry(1.75, 1.05, 3.2), hullPrimary);
    coreHull.position.set(0, 0, 0.2);
    this.shipGroup.add(coreHull);

    // Dorsale superiore rastremata (spina tecnica)
    const spine = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.38, 2.7), hullArmor);
    spine.position.set(0, 0.66, 0.35);
    this.shipGroup.add(spine);

    // Nervature corazzate laterali + bande arancioni
    [-0.92, 0.92].forEach((x) => {
      const sidePlate = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.68, 2.4), hullArmor);
      sidePlate.position.set(x, -0.02, 0.2);
      this.shipGroup.add(sidePlate);

      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.22, 0.75), hazardOrange);
      stripe.position.set(x, 0.06, -0.45);
      this.shipGroup.add(stripe);
    });

    // Chiglia inferiore (stiva cargo)
    const belly = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.32, 2.6), frameDark);
    belly.position.set(0, -0.62, 0.25);
    this.shipGroup.add(belly);

    // === 2. PRUA AFFUSOLATA (verso -Z) ===
    const bowMain = new THREE.Mesh(
      new THREE.CylinderGeometry(0.42, 0.95, 1.65, 6).rotateX(-Math.PI / 2),
      hullPrimary
    );
    bowMain.scale.set(1.15, 0.62, 1);
    bowMain.position.set(0, -0.04, -2.15);
    this.shipGroup.add(bowMain);

    // Paraurti/rostro industriale in punta
    const bowCap = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.35, 0.35), hazardOrange);
    bowCap.position.set(0, -0.06, -3.02);
    this.shipGroup.add(bowCap);

    // === 3. PONTE DI COMANDO SOPRAELEVATO ===
    const bridgeBase = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.45, 1.3), hullArmor);
    bridgeBase.position.set(0, 0.75, -0.85);
    this.shipGroup.add(bridgeBase);

    const bridgeCanopy = new THREE.Mesh(
      new THREE.CylinderGeometry(0.45, 0.68, 0.7, 4).rotateY(Math.PI / 4),
      frameDark
    );
    bridgeCanopy.scale.set(1.15, 0.6, 1.35);
    bridgeCanopy.position.set(0, 1.05, -0.85);
    this.shipGroup.add(bridgeCanopy);

    // Visiera panoramica luminosa
    const visorFront = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.24, 0.14), cockpitGlass);
    visorFront.position.set(0, 1.0, -1.45);
    visorFront.rotation.x = -0.25;
    this.shipGroup.add(visorFront);

    // Antennine anteriori
    const antennaGeo = new THREE.CylinderGeometry(0.018, 0.025, 0.8, 6);
    const ant1 = new THREE.Mesh(antennaGeo, frameDark);
    ant1.position.set(0.42, 1.35, -0.45);
    const ant2 = new THREE.Mesh(antennaGeo, frameDark);
    ant2.scale.set(1, 0.65, 1);
    ant2.position.set(-0.42, 1.22, -0.55);
    this.shipGroup.add(ant1, ant2);

    // === 4. ALI + GONDOLE MOTORI LATERALI ===
    this.flames = [];
    this.navLights = [];

    const pylonGeo = new THREE.BoxGeometry(1.1, 0.16, 1.25);
    const nacelleGeo = new THREE.CylinderGeometry(0.42, 0.48, 2.3, 10).rotateX(Math.PI / 2);
    const intakeRingGeo = new THREE.TorusGeometry(0.38, 0.06, 8, 16);
    const nozzleGeo = new THREE.CylinderGeometry(0.32, 0.44, 0.65, 12).rotateX(Math.PI / 2);

    const flameOuterGeo = new THREE.ConeGeometry(0.34, 2.2, 12).rotateX(Math.PI / 2);
    const flameOuterMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.75,
    });
    const flameCoreGeo = new THREE.ConeGeometry(0.18, 1.35, 10).rotateX(Math.PI / 2);
    const flameCoreMat = new THREE.MeshBasicMaterial({
      color: 0xe0f2fe,
      transparent: true,
      opacity: 0.95,
    });

    [-1, 1].forEach((side) => {
      // Pilone alare inclinato
      const pylon = new THREE.Mesh(pylonGeo, hullArmor);
      pylon.position.set(side * 1.35, -0.1, 0.85);
      pylon.rotation.z = side * -0.14;
      this.shipGroup.add(pylon);

      // Gondola motore
      const nacelle = new THREE.Mesh(nacelleGeo, hullPrimary);
      nacelle.position.set(side * 2.0, -0.18, 1.1);
      this.shipGroup.add(nacelle);

      // Anello presa d'aria anteriore
      const intake = new THREE.Mesh(intakeRingGeo, hazardOrange);
      intake.position.set(side * 2.0, -0.18, -0.05);
      this.shipGroup.add(intake);

      // Ugello posteriore
      const nozzle = new THREE.Mesh(nozzleGeo, frameDark);
      nozzle.position.set(side * 2.0, -0.18, 2.38);
      this.shipGroup.add(nozzle);

      // Doppia fiamma (esterna azzurra + nucleo bianco)
      const flameGroup = new THREE.Group();
      flameGroup.position.set(side * 2.0, -0.18, 2.75);
      const outer = new THREE.Mesh(flameOuterGeo, flameOuterMat);
      outer.position.z = 1.05;
      const core = new THREE.Mesh(flameCoreGeo, flameCoreMat);
      core.position.z = 0.65;
      flameGroup.add(outer, core);
      this.shipGroup.add(flameGroup);
      this.flames.push(flameGroup);

      // Luci di navigazione (Rosso a sinistra, Verde a destra)
      const navColor = side < 0 ? 0xef4444 : 0x22c55e;
      const navMesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.08, 8, 8),
        new THREE.MeshBasicMaterial({ color: navColor })
      );
      navMesh.position.set(side * 2.46, -0.18, 0.6);
      this.shipGroup.add(navMesh);
      this.navLights.push(navMesh);
    });

    // Propulsore ausiliario centrale
    const centerNozzle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.26, 0.34, 0.5, 10).rotateX(Math.PI / 2),
      frameDark
    );
    centerNozzle.position.set(0, -0.08, 1.95);
    this.shipGroup.add(centerNozzle);

    const centerFlame = new THREE.Group();
    centerFlame.position.set(0, -0.08, 2.25);
    const cOuter = new THREE.Mesh(flameOuterGeo, flameOuterMat);
    cOuter.scale.set(0.7, 0.7, 0.75);
    cOuter.position.z = 0.75;
    centerFlame.add(cOuter);
    this.shipGroup.add(centerFlame);
    this.flames.push(centerFlame);

    // Luce dinamica dei motori
    this.engineLight = new THREE.PointLight(0x38bdf8, 0, 10);
    this.engineLight.position.set(0, -0.1, 3.3);
    this.shipGroup.add(this.engineLight);

    // === 5. MODULI 3D MONTABILI ===
    this.modules = {};
    this.buildModules(hullArmor, frameDark, hazardOrange);
  }

  buildModules(hullArmor, frameDark, hazardOrange) {
    // 1. TRIVELLA LASER (Prua avanzata con doppie pinze + punta rotante)
    const drillGroup = new THREE.Group();
    const housing = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.55, 0.75), frameDark);
    housing.position.set(0, -0.08, -3.2);

    this.drillHead = new THREE.Group();
    this.drillHead.position.set(0, -0.08, -3.6);
    const auger = new THREE.Mesh(
      new THREE.ConeGeometry(0.34, 1.25, 6).rotateX(-Math.PI / 2),
      hazardOrange
    );
    auger.position.z = -0.62;
    const tipGlow = new THREE.Mesh(
      new THREE.SphereGeometry(0.14, 10, 10),
      new THREE.MeshBasicMaterial({ color: 0xfbbf24 })
    );
    tipGlow.position.z = -1.28;
    this.drillHead.add(auger, tipGlow);

    // Bracci stabilizzatori laterali
    [-0.52, 0.52].forEach((x) => {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.16, 1.15), hullArmor);
      arm.position.set(x, -0.08, -3.7);
      drillGroup.add(arm);
    });

    drillGroup.add(housing, this.drillHead);
    drillGroup.visible = false;
    this.shipGroup.add(drillGroup);
    this.modules.drill = drillGroup;

    // 2. SERBATOI EXTRA (Doppi cilindri pressurizzati sui fianchi anteriori)
    const tanksGroup = new THREE.Group();
    const tankBodyGeo = new THREE.CylinderGeometry(0.32, 0.32, 1.7, 14).rotateX(Math.PI / 2);
    const tankCapGeo = new THREE.SphereGeometry(0.32, 12, 10);

    [-1.32, 1.32].forEach((x) => {
      const pod = new THREE.Group();
      pod.position.set(x, 0.12, -0.55);

      const body = new THREE.Mesh(tankBodyGeo, hazardOrange);
      const capF = new THREE.Mesh(tankCapGeo, frameDark);
      capF.position.z = -0.85;
      const capB = new THREE.Mesh(tankCapGeo, frameDark);
      capB.position.z = 0.85;
      const strut = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.2, 0.35), frameDark);
      strut.position.x = x > 0 ? -0.35 : 0.35;

      pod.add(body, capF, capB, strut);
      tanksGroup.add(pod);
    });

    tanksGroup.visible = false;
    this.shipGroup.add(tanksGroup);
    this.modules.tanks = tanksGroup;

    // 3. SCANNER PROFONDO (Torretta dorsale rotante con parabola e anello olo)
    const scannerGroup = new THREE.Group();
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.34, 0.42, 8), frameDark);
    mast.position.set(0, 1.0, 0.85);

    this.radarDish = new THREE.Group();
    this.radarDish.position.set(0, 1.38, 0.85);
    const dish = new THREE.Mesh(
      new THREE.CylinderGeometry(0.68, 0.12, 0.24, 14).rotateX(Math.PI / 3),
      new THREE.MeshStandardMaterial({ color: 0xcbd5e1, metalness: 0.85, roughness: 0.2 })
    );
    const holoRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.45, 0.025, 8, 24).rotateX(Math.PI / 3),
      new THREE.MeshBasicMaterial({ color: 0x22c55e, transparent: true, opacity: 0.7 })
    );
    holoRing.position.set(0, 0.18, -0.15);
    const emitter = new THREE.Mesh(
      new THREE.SphereGeometry(0.09, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0x4ade80 })
    );
    emitter.position.set(0, 0.28, -0.24);

    this.radarDish.add(dish, holoRing, emitter);
    scannerGroup.add(mast, this.radarDish);
    scannerGroup.visible = false;
    this.shipGroup.add(scannerGroup);
    this.modules.scanner = scannerGroup;

    // 4. SCUDO DEFLETTORE (Doppia cupola energetica)
    const shieldGroup = new THREE.Group();
    const shieldGeo = new THREE.IcosahedronGeometry(3.2, 2);

    this.shieldWire = new THREE.Mesh(
      shieldGeo,
      new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        wireframe: true,
        transparent: true,
        opacity: 0.18,
      })
    );
    this.shieldShell = new THREE.Mesh(
      shieldGeo,
      new THREE.MeshBasicMaterial({
        color: 0x0ea5e9,
        transparent: true,
        opacity: 0.06,
        side: THREE.DoubleSide,
      })
    );

    shieldGroup.add(this.shieldWire, this.shieldShell);
    shieldGroup.scale.set(0.95, 0.62, 1.38);
    shieldGroup.position.set(0, 0.1, -0.1);
    shieldGroup.visible = false;
    this.shipGroup.add(shieldGroup);
    this.modules.shield = shieldGroup;
  }

  initEngineParticles() {
    const count = 90;
    const positions = new Float32Array(count * 3);
    this.particleData = [];

    for (let i = 0; i < count; i++) {
      const side = i % 2 === 0 ? -2.0 : 2.0;
      const life = Math.random();
      this.particleData.push({
        baseX: side,
        life,
        offsetX: (Math.random() - 0.5) * 0.25,
        offsetY: (Math.random() - 0.5) * 0.25,
      });
      positions[i * 3] = side;
      positions[i * 3 + 1] = -0.18;
      positions[i * 3 + 2] = 2.8 + life * 4.5;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color: 0x7dd3fc,
      size: 0.16,
      transparent: true,
      opacity: 0.7,
    });

    this.engineParticles = new THREE.Points(geo, mat);
    this.shipGroup.add(this.engineParticles);
  }

  // --- API PUBBLICA ---
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
  
  setBiomeTint(hexColor) {
    const color = new THREE.Color(hexColor);
    this.scene.background = color;
    this.scene.fog.color = color;
  }

  animate() {
    requestAnimationFrame(() => this.animate());
    const delta = Math.min(0.05, this.clock.getDelta());
    const elapsed = this.clock.getElapsedTime();

    // 1. Rollio e galleggiamento naturale della nave
    this.shipGroup.position.y = Math.sin(elapsed * 1.6) * 0.14;
    this.shipGroup.rotation.z = Math.sin(elapsed * 0.95) * 0.05;
    this.shipGroup.rotation.x = Math.cos(elapsed * 0.7) * 0.025;

    // 2. Scossa impatto & lampo rosso
    if (this.damageFlash > 0) {
      this.damageFlash = Math.max(0, this.damageFlash - delta * 2.4);
      this.damageLight.intensity = this.damageFlash * 15;
      this.shipGroup.position.x = (Math.random() - 0.5) * 0.3 * this.damageFlash;
    } else {
      this.damageLight.intensity = 0;
      this.shipGroup.position.x = 0;
    }

    // 3. Luci di navigazione lampeggianti
    const blinkOn = Math.sin(elapsed * 5.0) > 0.2;
    this.navLights.forEach((light) => {
      light.visible = blinkOn;
    });

    // 4. Propulsori & particelle
    const isMoving = this.speedMultiplier > 0;
    const flicker = 0.85 + Math.random() * 0.3;

    this.flames.forEach((flame) => {
      flame.visible = isMoving;
      if (isMoving) {
        const zScale = (0.55 + this.speedMultiplier * 0.42) * flicker;
        flame.scale.set(1, 1, zScale);
      }
    });

    this.engineLight.intensity = isMoving ? (2.2 + this.speedMultiplier * 1.1) * flicker : 0;
    this.engineParticles.visible = isMoving;

    if (isMoving) {
      const pPos = this.engineParticles.geometry.attributes.position;
      for (let i = 0; i < this.particleData.length; i++) {
        const p = this.particleData[i];
        p.life += delta * (1.8 + this.speedMultiplier * 0.9);
        if (p.life > 1) {
          p.life = 0;
          p.offsetX = (Math.random() - 0.5) * 0.28;
          p.offsetY = (Math.random() - 0.5) * 0.28;
        }
        pPos.setXYZ(
          i,
          p.baseX + p.offsetX * (1 + p.life * 1.5),
          -0.18 + p.offsetY * (1 + p.life * 1.5),
          2.8 + p.life * (2.5 + this.speedMultiplier * 1.5)
        );
      }
      pPos.needsUpdate = true;
    }

    // 5. Animazione moduli 3D
    if (this.modules.drill.visible) {
      this.drillHead.rotation.z += delta * (isMoving ? 5.5 : 1.5);
    }
    if (this.modules.scanner.visible) {
      this.radarDish.rotation.y += delta * 2.0;
    }
    if (this.modules.shield.visible) {
      this.modules.shield.rotation.y -= delta * 0.2;
      this.shieldWire.material.opacity = 0.14 + Math.sin(elapsed * 3.2) * 0.05;
    }

    // 6. Movimento stelle & detriti spaziali
    const worldSpeed = isMoving ? 9 * this.speedMultiplier : 0.6;
    const starPos = this.stars.geometry.attributes.position;
    for (let i = 0; i < starPos.count; i++) {
      let z = starPos.getZ(i) + worldSpeed * delta;
      if (z > 40) z = -75;
      starPos.setZ(i, z);
    }
    starPos.needsUpdate = true;

    this.debrisItems.forEach((item) => {
      item.mesh.rotation.x += item.rotX * delta;
      item.mesh.rotation.y += item.rotY * delta;
      item.mesh.position.z += worldSpeed * item.speedFactor * 1.3 * delta;
      if (item.mesh.position.z > 28) {
        this.placeDebris(item.mesh, false);
      }
    });

    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }
}