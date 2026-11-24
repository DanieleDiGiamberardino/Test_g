import './style.css';
import { ShipScene } from './3d/ShipScene.js';

const container = document.getElementById('canvas-container');
const shipScene = new ShipScene(container);

// Stato temporaneo dei moduli
const activeModules = {
  drill: false,
  tanks: false,
  scanner: false,
  shield: false,
};

// Controlli velocità
document.querySelectorAll('.btn-speed').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.btn-speed').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    const speed = Number(btn.dataset.speed);
    shipScene.setSpeed(speed);
  });
});

// Controlli Moduli 3D
document.querySelectorAll('.btn-mod').forEach((btn) => {
  btn.addEventListener('click', () => {
    const mod = btn.dataset.mod;
    activeModules[mod] = !activeModules[mod];

    btn.classList.toggle('active', activeModules[mod]);
    btn.querySelector('.badge').textContent = activeModules[mod] ? 'ON' : 'OFF';

    shipScene.setModuleActive(mod, activeModules[mod]);
  });
});

// Test danno
document.getElementById('btn-damage').addEventListener('click', () => {
  shipScene.triggerDamage();
});