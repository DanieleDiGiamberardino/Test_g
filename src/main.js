import './style.css';
import { ShipScene } from './3d/ShipScene.js';
import { GameEngine } from './core/GameEngine.js';
import { MODULES, TRAITS, BIOMES } from './data/gameData.js';

const shipScene = new ShipScene(document.getElementById('canvas-container'));

const elSector = document.getElementById('sector-badge');
const elHull = document.getElementById('val-hull');
const elFuel = document.getElementById('val-fuel');
const elScrap = document.getElementById('val-scrap');
const elCores = document.getElementById('val-cores');
const elPowerFree = document.getElementById('power-free');
const elReactor = document.getElementById('reactor-controls');
const elCrewList = document.getElementById('crew-list');
const elNodeBar = document.getElementById('node-bar');
const elNodeLabel = document.getElementById('node-label');
const elLogFeed = document.getElementById('log-feed');
const elDock = document.getElementById('bottom-dock');
const btnAiMode = document.getElementById('btn-aimode');
const selProtocol = document.getElementById('sel-protocol');

let engine;

function renderUI(lightUpdate = false) {
  const s = engine.state;

  elHull.textContent = `${Math.ceil(s.hull)}/${s.maxHull}`;
  elFuel.textContent = `${Math.ceil(s.fuel)}/${s.maxFuel}`;
  elScrap.textContent =
    s.mode === 'EXPEDITION' ? `${s.bankScrap} (+${s.cargoScrap})` : `${s.bankScrap}`;
  elCores.textContent =
    s.mode === 'EXPEDITION' ? `${s.bankCores} (+${s.cargoCores})` : `${s.bankCores}`;
  elNodeBar.style.width = `${s.nodeProgress}%`;

  if (lightUpdate) {
    const timerBar = document.getElementById('dilemma-timer-bar');
    const timerText = document.getElementById('dilemma-timer-text');
    if (timerBar && engine.activeDilemma) {
      const pct = Math.max(0, (engine.dilemmaTimer / engine.dilemmaMaxTime) * 100);
      timerBar.style.width = `${pct}%`;
    }
    if (timerText && engine.activeDilemma) {
      timerText.textContent = `Scelta automatica IA tra ${Math.ceil(engine.dilemmaTimer)}s`;
    }
    return;
  }

  // Badge Settore
  if (s.mode === 'HANGAR') {
    elSector.textContent = 'HANGAR ORBITALE';
    elNodeLabel.textContent = 'Ormeggiata • Potenzia la nave o decolla';
  } else {
    const biome = engine.getCurrentBiome();
    elSector.textContent = `SETTORE ${s.sector} // ${biome.name.toUpperCase()}`;
    elNodeLabel.textContent = `Nodo ${s.node}/${s.nodesPerSector} • Stiva: +${s.cargoScrap} R, +${s.cargoCores} N`;
  }

  // IA
  btnAiMode.textContent = s.aiMode === 'AUTO' ? 'IA: AUTO (60s)' : 'IA: PAUSA';
  btnAiMode.classList.toggle('active', s.aiMode === 'AUTO');
  selProtocol.value = s.protocol;

  // Reattore
  const usedPower = s.power.engines + s.power.shields + s.power.scanners;
  elPowerFree.textContent = `LIBERI: ${s.powerTotal - usedPower}`;
  const sysNames = [
    { key: 'engines', label: 'MOTORI' },
    { key: 'shields', label: 'SCUDI' },
    { key: 'scanners', label: 'SCANNER' },
  ];

  elReactor.innerHTML = sysNames
    .map(({ key, label }) => {
      const val = s.power[key];
      const pips = Array.from({ length: 4 }, (_, i) => `<span class="pip ${i < val ? 'on' : ''}"></span>`).join('');
      return `
        <div class="reactor-row">
          <span>${label}</span>
          <div class="pips">${pips}</div>
          <div class="pip-btns">
            <button class="btn-mini" data-pow="${key}" data-d="-1">-</button>
            <button class="btn-mini" data-pow="${key}" data-d="1">+</button>
          </div>
        </div>
      `;
    })
    .join('');

  elReactor.querySelectorAll('[data-pow]').forEach((btn) => {
    btn.addEventListener('click', () => {
      engine.adjustPower(btn.dataset.pow, Number(btn.dataset.d));
    });
  });

  // Equipaggio
  elCrewList.innerHTML = s.crew
    .map((m) => {
      const traitsHtml = m.traits.length
        ? m.traits
            .map((tId) => {
              const t = TRAITS[tId];
              return t ? `<span class="trait-pill ${t.type}" title="${t.desc}">${t.label}</span>` : '';
            })
            .join('')
        : `<span class="hint">Nessun tratto attivo</span>`;
      return `
        <div class="crew-card">
          <div class="crew-head">
            <strong>${m.name}</strong>
            <span class="crew-role">${m.roleLabel}</span>
          </div>
          <div class="trait-row">${traitsHtml}</div>
        </div>
      `;
    })
    .join('');

  // Telemetria
  elLogFeed.innerHTML = engine.logs
    .map((l) =>
      typeof l === 'string'
        ? `<div class="log-item">${l}</div>`
        : `<div class="log-item ${l.type}"><span class="log-time">[${l.time}]</span>${l.msg}</div>`
    )
    .join('');

  renderBottomDock();
}

function renderBottomDock() {
  const s = engine.state;

  // 1. DILEMMA ATTIVO
  if (engine.activeDilemma) {
    const d = engine.activeDilemma;
    const aiIdx = engine.getAiRecommendedIndex();
    const timerPct = (engine.dilemmaTimer / engine.dilemmaMaxTime) * 100;

    elDock.innerHTML = `
      ${s.aiMode === 'AUTO' ? `<div id="dilemma-timer-bar" class="timer-bar" style="width:${timerPct}%"></div>` : ''}
      <div class="dilemma-header">
        <span class="dilemma-title">⚠️ ${d.title}</span>
        <span id="dilemma-timer-text" class="hint">${
          s.aiMode === 'AUTO'
            ? `Scelta automatica IA tra ${Math.ceil(engine.dilemmaTimer)}s`
            : 'Gioco in pausa: scegli un’azione'
        }</span>
      </div>
      <p class="dilemma-text">${d.text}</p>
      <div class="dilemma-choices">
        ${d.choices
          .map((c, idx) => {
            const chance = engine.getChoiceChance(c);
            const isAi = idx === aiIdx;
            const roleTag = c.roleBonus ? ` • +${c.roleBonus}` : '';
            return `
              <button class="choice-btn ${isAi ? 'ai-pick' : ''}" data-choice="${idx}">
                <strong>${c.label} ${isAi ? '🤖' : ''}</strong>
                <span class="hint">Successo: <strong style="color:#38bdf8">${chance}%</strong>${roleTag}</span>
              </button>
            `;
          })
          .join('')}
      </div>
    `;

    elDock.querySelectorAll('[data-choice]').forEach((btn) => {
      btn.addEventListener('click', () => engine.resolveDilemma(Number(btn.dataset.choice)));
    });
    return;
  }

  // 2. FINE SETTORE (BIVIO ROTTE BIOMA)
  if (engine.sectorComplete) {
    const biomeCards = engine.sectorOptions
      .map((bId) => {
        const b = BIOMES[bId];
        return `
          <button class="biome-card" data-biome="${b.id}" style="border-color:#f59e0b;">
            <strong>🚀 ${b.name}</strong>
            <small>${b.desc}</small>
          </button>
        `;
      })
      .join('');

    elDock.innerHTML = `
      <div class="dilemma-header">
        <span class="dilemma-title">✅ SETTORE ${s.sector} COMPLETATO — SCEGLI LA ROTTA</span>
        <span class="hint">In stiva: +${s.cargoScrap} Rottami, +${s.cargoCores} Nuclei</span>
      </div>
      <div class="biome-fork">
        <button id="btn-return" class="biome-card" style="border-color:#22c55e;">
          <strong>🏠 Rientra in Hangar</strong>
          <small>Metti al sicuro tutto il bottino e potenzia la nave.</small>
        </button>
        ${biomeCards}
      </div>
    `;

    document.getElementById('btn-return').addEventListener('click', () => engine.returnToHangar(false));
    elDock.querySelectorAll('[data-biome]').forEach((btn) => {
      btn.addEventListener('click', () => engine.pushNextSector(btn.dataset.biome));
    });
    return;
  }

  // 3. HANGAR
  if (s.mode === 'HANGAR') {
    const repairCost = Math.ceil((s.maxHull - s.hull) * 0.4);
    const fuelCost = Math.ceil((s.maxFuel - s.fuel) * 0.25);
    const negTraits = engine.countNegativeTraits();
    const cureCost = negTraits * 15;

    const modsHtml = Object.values(MODULES)
      .map((m) => {
        const owned = s.modules[m.id];
        return `
          <button class="mod-card ${owned ? 'owned' : ''}" data-buy="${m.id}" ${owned ? 'disabled' : ''}>
            <strong>${m.name} ${owned ? '✓ MONTATO' : `(${m.costScrap} R)`}</strong>
            <small>${m.desc}</small>
          </button>
        `;
      })
      .join('');

    elDock.innerHTML = `
      <div class="hangar-grid">
        <div class="hangar-actions">
          <button id="btn-repair" ${repairCost === 0 ? 'disabled' : ''}>
            🔧 Ripara Scafo (${repairCost} R)
          </button>
          <button id="btn-refuel" ${fuelCost === 0 ? 'disabled' : ''}>
            ⛽ Rifornisci Fuel (${fuelCost} R)
          </button>
          <button id="btn-cure" ${negTraits === 0 ? 'disabled' : ''}>
            🩺 Infermeria (${cureCost} R • ${negTraits} malus)
          </button>
          <button id="btn-hull-up">
            ⚡ Telaio Lv.${s.hullLevel + 1} (${s.hullLevel} Nuclei) → +1 Energia
          </button>
        </div>

        <div class="modules-grid">${modsHtml}</div>

        <button id="btn-launch" class="btn-launch">🚀 LANCIA<br/>SPEDIZIONE</button>
      </div>
    `;

    document.getElementById('btn-repair').addEventListener('click', () => engine.repairHull());
    document.getElementById('btn-refuel').addEventListener('click', () => engine.refuel());
    document.getElementById('btn-cure').addEventListener('click', () => engine.cureCrew());
    document.getElementById('btn-hull-up').addEventListener('click', () => engine.upgradeHull());
    document.getElementById('btn-launch').addEventListener('click', () => engine.launchExpedition());
    elDock.querySelectorAll('[data-buy]').forEach((btn) => {
      btn.addEventListener('click', () => engine.buyModule(btn.dataset.buy));
    });
    return;
  }

  // 4. IN VIAGGIO
  elDock.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center;">
      <div>
        <strong>NAVIGAZIONE AUTONOMA IN CORSO...</strong>
        <p class="hint">Sposta energia tra Motori, Scudi e Scanner mentre l'equipaggio esplora il settore.</p>
      </div>
      <button id="btn-abort" style="border-color:#ef4444; color:#fca5a5;">
        Rientro Anticipato (Salva Bottino)
      </button>
    </div>
  `;
  document.getElementById('btn-abort').addEventListener('click', () => engine.returnToHangar(false));
}

engine = new GameEngine(shipScene, renderUI);
renderUI();

document.querySelectorAll('.btn-speed').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.btn-speed').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    engine.setSpeed(Number(btn.dataset.speed));
  });
});

btnAiMode.addEventListener('click', () => engine.toggleAiMode());
selProtocol.addEventListener('change', (e) => engine.setProtocol(e.target.value));
document.getElementById('btn-reset').addEventListener('click', () => {
  if (confirm('Vuoi azzerare i progressi salvati?')) engine.resetSave();
});