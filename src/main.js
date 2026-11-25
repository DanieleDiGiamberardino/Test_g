import './style.css';
import { ShipScene } from './3d/ShipScene.js';
import { SoundFX } from './core/SoundFX.js';
import { GameEngine } from './core/GameEngine.js';
import { MODULES, TRAITS, BIOMES, TECH_TREE, CHASSIS, RELICS } from './data/gameData.js';

const shipScene = new ShipScene(document.getElementById('canvas-container'));
const soundFX = new SoundFX();

const elSector = document.getElementById('sector-badge');
const elHull = document.getElementById('val-hull');
const elFuel = document.getElementById('val-fuel');
const elScrap = document.getElementById('val-scrap');
const elCores = document.getElementById('val-cores');
const elPowerFree = document.getElementById('power-free');
const elReactor = document.getElementById('reactor-controls');
const elCrewList = document.getElementById('crew-list');
const elRelicCount = document.getElementById('relic-count');
const elRelicList = document.getElementById('relic-list');
const elNodeBar = document.getElementById('node-bar');
const elNodeLabel = document.getElementById('node-label');
const elHeatVal = document.getElementById('val-heat');
const elHeatBar = document.getElementById('heat-bar');
const btnGhost = document.getElementById('btn-ghost');
const elLogFeed = document.getElementById('log-feed');
const elDock = document.getElementById('bottom-dock');
const btnAiMode = document.getElementById('btn-aimode');
const selProtocol = document.getElementById('sel-protocol');
const btnMute = document.getElementById('btn-mute');

let hangarTab = 'workshop'; // 'workshop' | 'tech' | 'chassis'
let engine;

function updateMuteIcon() {
  btnMute.textContent = soundFX.muted ? '🔇' : '🔊';
}
updateMuteIcon();

function renderUI(lightUpdate = false) {
  const s = engine.state;
  const maxHull = engine.getMaxHull();
  const maxFuel = engine.getMaxFuel();

  elHull.textContent = `${Math.ceil(s.hull)}/${maxHull}`;
  elFuel.textContent = `${Math.ceil(s.fuel)}/${maxFuel}`;
  elScrap.textContent =
    s.mode === 'EXPEDITION' ? `${s.bankScrap} (+${s.cargoScrap})` : `${s.bankScrap}`;
  elCores.textContent =
    s.mode === 'EXPEDITION' ? `${s.bankCores} (+${s.cargoCores})` : `${s.bankCores}`;
  elNodeBar.style.width = `${s.nodeProgress}%`;

  const heatPct = Math.round(s.heat);
  elHeatVal.textContent = `${heatPct}%`;
  elHeatVal.style.color = heatPct >= 75 ? '#f87171' : heatPct >= 45 ? '#fbbf24' : '#38bdf8';
  elHeatBar.style.width = `${heatPct}%`;
  elHeatBar.classList.toggle('danger', heatPct >= 75);

  btnGhost.disabled = s.mode !== 'EXPEDITION';
  btnGhost.classList.toggle('active', s.ghostMode);
  btnGhost.textContent = s.ghostMode ? '👻 FANTASMA: ATTIVO' : '👻 MODALITÀ FANTASMA';

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

    const hunterBar = document.getElementById('hunter-timer-bar');
    const hunterText = document.getElementById('hunter-timer-text');
    const stealthBar = document.getElementById('hunter-stealth-bar');
    if (engine.hunterActive) {
      if (hunterBar) {
        hunterBar.style.width = `${Math.max(0, (engine.hunterTimer / engine.hunterMaxTime) * 100)}%`;
      }
      if (hunterText) {
        hunterText.textContent = `Impatto/IA tra ${Math.ceil(engine.hunterTimer)}s`;
      }
      if (stealthBar) {
        stealthBar.style.width = `${Math.min(100, engine.hunterStealthProgress)}%`;
      }
    }
    return;
  }

  // Badge Settore
  if (s.mode === 'HANGAR') {
    elSector.textContent = `HANGAR // ${engine.getChassis().name.toUpperCase()}`;
    elNodeLabel.textContent = 'Ormeggiata • Potenzia la nave o decolla';
  } else {
    const biome = engine.getCurrentBiome();
    elSector.textContent = `SETTORE ${s.sector} // ${biome.name.toUpperCase()}`;
    elNodeLabel.textContent = s.ghostMode
      ? '👻 Deriva Silenziosa • Raffreddamento scafo'
      : `Nodo ${s.node}/${s.nodesPerSector} • Stiva: +${s.cargoScrap} R, +${s.cargoCores} N`;
  }

  // IA
  btnAiMode.textContent = s.aiMode === 'AUTO' ? 'IA: AUTO (60s)' : 'IA: PAUSA';
  btnAiMode.classList.toggle('active', s.aiMode === 'AUTO');
  selProtocol.value = s.protocol;

  // Reattore
  const totalPower = engine.getPowerTotal();
  const usedPower = s.power.engines + s.power.shields + s.power.scanners;
  elPowerFree.textContent = `LIBERI: ${totalPower - usedPower}`;
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

  // Reliquie Run
  elRelicCount.textContent = `${s.relics.length}/3`;
  elRelicList.innerHTML = s.relics.length
    ? s.relics
        .map((rId) => {
          const r = RELICS[rId];
          return `<div class="relic-pill"><strong>${r.icon} ${r.name}</strong><small>${r.desc}</small></div>`;
        })
        .join('')
    : `<div class="hint">Nessuna reliquia equipaggiata</div>`;

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
  elDock.classList.toggle('hunter-alert', engine.hunterActive);

  // 0. DRAFT RELIQUIA ROGUELITE
  if (engine.pendingRelicChoices) {
    const cards = engine.pendingRelicChoices
      .map((rId) => {
        const r = RELICS[rId];
        return `
          <button class="choice-btn" data-relic="${r.id}" style="border-color:#c084fc;">
            <strong>${r.icon} ${r.name}</strong>
            <span class="hint">${r.desc}</span>
          </button>
        `;
      })
      .join('');

    elDock.innerHTML = `
      <div class="dilemma-header">
        <span class="dilemma-title" style="color:#c084fc;">✨ RELIQUIA ROGUELITE RILEVATA — SCEGLI 1 POTENZIAMENTO PER QUESTA RUN</span>
        <button id="btn-skip-relic" class="btn-mini">SALTA</button>
      </div>
      <div class="dilemma-choices" style="margin-top:8px;">${cards}</div>
    `;

    elDock.querySelectorAll('[data-relic]').forEach((btn) => {
      btn.addEventListener('click', () => engine.pickRelic(btn.dataset.relic));
    });
    document.getElementById('btn-skip-relic').addEventListener('click', () => engine.skipRelic());
    return;
  }

  // 1. CACCIATORE MECCANICO ATTIVO
  if (engine.hunterActive) {
    if (s.ghostMode) {
      elDock.innerHTML = `
        <div class="dilemma-header">
          <span class="dilemma-title" style="color:#38bdf8;">👻 DERIVA SILENZIOSA — SCANSIONE CACCIATORE IN CORSO</span>
          <span class="hint">Resta spento finché il raggio rosso non ti supera...</span>
        </div>
        <div class="progress-wrap" style="height:10px; margin-top:8px;">
          <div id="hunter-stealth-bar" class="stealth-bar" style="width:${engine.hunterStealthProgress}%"></div>
        </div>
      `;
      return;
    }

    const trapChance = engine.getHunterTrapChance();
    const decoyDrop = Math.max(8, Math.floor(s.cargoScrap * 0.25));
    const timerPct = (engine.hunterTimer / engine.hunterMaxTime) * 100;

    elDock.innerHTML = `
      <div id="hunter-timer-bar" class="hunter-bar" style="width:${timerPct}%"></div>
      <div class="dilemma-header">
        <span class="dilemma-title" style="color:#f87171;">🚨 CACCIATORE MECCANICO IN AVVICINAMENTO</span>
        <span id="hunter-timer-text" class="hint">Impatto/IA tra ${Math.ceil(engine.hunterTimer)}s</span>
      </div>
      <p class="dilemma-text">La tua traccia termica ha attirato un predatore del cimitero. Il raggio scanner sta agganciando lo scafo!</p>
      <div class="dilemma-choices">
        <button class="choice-btn" data-hunter="ghost" style="border-color:#38bdf8;">
          <strong>👻 Spegni Tutto (Fantasma)</strong>
          <span class="hint">100% sicuro • Ti nascondi e azzeri il calore</span>
        </button>
        <button class="choice-btn" data-hunter="decoy" style="border-color:#f59e0b;">
          <strong>📦 Sgancia Esca (-${decoyDrop} R)</strong>
          <span class="hint">Lo depisti subito e riparti senza fermarti</span>
        </button>
        <button class="choice-btn" data-hunter="trap" style="border-color:#c084fc;">
          <strong>⚡ Trappola EMP (${trapChance}%)</strong>
          <span class="hint">Vittoria: +2 Nuclei, +35 R + Reliquia • Fallimento: danni gravi</span>
        </button>
      </div>
    `;

    elDock.querySelectorAll('[data-hunter]').forEach((btn) => {
      btn.addEventListener('click', () => engine.resolveHunterAction(btn.dataset.hunter));
    });
    return;
  }

  // 2. DILEMMA ATTIVO
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
            const chance = engine.getChoiceChance(c, idx);
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

  // 3. FINE SETTORE
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

  // 4. HANGAR (OFFICINA | ALBERO TECH | TELAI 3D)
  if (s.mode === 'HANGAR') {
    const tabsHeader = `
      <div class="dock-tabs">
        <div class="tab-group">
          <button class="tab-btn ${hangarTab === 'workshop' ? 'active' : ''}" data-tab="workshop">
            🛠️ OFFICINA
          </button>
          <button class="tab-btn ${hangarTab === 'tech' ? 'active' : ''}" data-tab="tech">
            🧬 ALBERO TECH (${s.techs.length}/${TECH_TREE.length})
          </button>
          <button class="tab-btn ${hangarTab === 'chassis' ? 'active' : ''}" data-tab="chassis">
            🚀 TELAI 3D (${s.unlockedChassis.length}/${Object.keys(CHASSIS).length})
          </button>
        </div>
        <button id="btn-launch" class="btn-launch" style="padding:7px 18px; font-size:0.82rem;">
          🚀 LANCIA SPEDIZIONE
        </button>
      </div>
    `;

    if (hangarTab === 'workshop') {
      const repairCost = Math.ceil((engine.getMaxHull() - s.hull) * 0.4);
      const fuelCost = Math.ceil((engine.getMaxFuel() - s.fuel) * 0.25);
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
        ${tabsHeader}
        <div class="hangar-grid" style="grid-template-columns: 1fr 2fr;">
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
        </div>
      `;

      document.getElementById('btn-repair').addEventListener('click', () => engine.repairHull());
      document.getElementById('btn-refuel').addEventListener('click', () => engine.refuel());
      document.getElementById('btn-cure').addEventListener('click', () => engine.cureCrew());
      document.getElementById('btn-hull-up').addEventListener('click', () => engine.upgradeHull());
      elDock.querySelectorAll('[data-buy]').forEach((btn) => {
        btn.addEventListener('click', () => engine.buyModule(btn.dataset.buy));
      });
    } else if (hangarTab === 'tech') {
      const branches = ['INDUSTRIA', 'AUTOMAZIONE IA', 'SOPRAVVIVENZA'];
      const colsHtml = branches
        .map((bName) => {
          const items = TECH_TREE.filter((t) => t.branch === bName);
          const cards = items
            .map((t) => {
              const unlocked = engine.hasTech(t.id);
              const locked = t.requires && !engine.hasTech(t.requires);
              const costLabel =
                t.costCores > 0 ? `${t.costScrap} R • ${t.costCores} N` : `${t.costScrap} R`;
              return `
                <button
                  class="tech-card ${unlocked ? 'unlocked' : locked ? 'locked' : ''}"
                  data-tech="${t.id}"
                  ${unlocked || locked ? 'disabled' : ''}
                >
                  <strong>${t.name} ${unlocked ? '✓' : locked ? '🔒' : `(${costLabel})`}</strong>
                  <small>${t.desc}</small>
                </button>
              `;
            })
            .join('');
          return `
            <div class="tech-col">
              <div class="tech-col-title">${bName}</div>
              ${cards}
            </div>
          `;
        })
        .join('');

      elDock.innerHTML = `
        ${tabsHeader}
        <div class="tech-branches">${colsHtml}</div>
      `;

      elDock.querySelectorAll('[data-tech]').forEach((btn) => {
        btn.addEventListener('click', () => engine.unlockTech(btn.dataset.tech));
      });
    } else {
      // TAB TELAI 3D
      const chassisCards = Object.values(CHASSIS)
        .map((ch) => {
          const unlocked = s.unlockedChassis.includes(ch.id);
          const equipped = s.chassis === ch.id;
          const badge = equipped
            ? '✓ ATTIVO'
            : unlocked
            ? 'EQUIPAGGIA'
            : `${ch.costScrap} R • ${ch.costCores} N`;
          return `
            <button
              class="chassis-card ${equipped ? 'equipped' : unlocked ? 'unlocked' : ''}"
              data-chassis="${ch.id}"
              ${equipped ? 'disabled' : ''}
            >
              <strong>${ch.name} (${badge})</strong>
              <small>${ch.desc}</small>
            </button>
          `;
        })
        .join('');

      elDock.innerHTML = `
        ${tabsHeader}
        <div class="chassis-grid">${chassisCards}</div>
      `;

      elDock.querySelectorAll('[data-chassis]').forEach((btn) => {
        btn.addEventListener('click', () => engine.selectOrBuyChassis(btn.dataset.chassis));
      });
    }

    document.getElementById('btn-launch').addEventListener('click', () => engine.launchExpedition());
    elDock.querySelectorAll('[data-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        hangarTab = btn.dataset.tab;
        soundFX.playClick();
        renderBottomDock();
      });
    });
    return;
  }

  // 5. IN VIAGGIO
  elDock.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center;">
      <div>
        <strong>${s.ghostMode ? '👻 DERIVA SILENZIOSA ATTIVA' : 'NAVIGAZIONE AUTONOMA IN CORSO...'}</strong>
        <p class="hint">${
          s.ghostMode
            ? 'Motori spenti: consumo fuel 0% e dispersione rapida della Traccia Termica.'
            : 'Attenzione alla Traccia Termica a 2x/3x: oltre l’85% attiri un Cacciatore Meccanico!'
        }</p>
      </div>
      <button id="btn-abort" style="border-color:#ef4444; color:#fca5a5;">
        Rientro Anticipato (Salva Bottino)
      </button>
    </div>
  `;
  document.getElementById('btn-abort').addEventListener('click', () => engine.returnToHangar(false));
}

engine = new GameEngine(shipScene, soundFX, renderUI);
renderUI();

document.querySelectorAll('.btn-speed').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.btn-speed').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    engine.setSpeed(Number(btn.dataset.speed));
  });
});

btnGhost.addEventListener('click', () => engine.toggleGhostMode());
btnAiMode.addEventListener('click', () => engine.toggleAiMode());
selProtocol.addEventListener('change', (e) => engine.setProtocol(e.target.value));
btnMute.addEventListener('click', () => {
  soundFX.toggleMute();
  updateMuteIcon();
});
document.getElementById('btn-reset').addEventListener('click', () => {
  if (confirm('Vuoi azzerare i progressi salvati?')) engine.resetSave();
});

window.addEventListener(
  'pointerdown',
  () => {
    if (!soundFX.muted) {
      soundFX.init();
      engine.sync3D();
    }
  },
  { once: true }
);

const btnMixer = document.getElementById('btn-mixer');
const elMixer = document.getElementById('audio-mixer');
btnMixer.addEventListener('click', () => {
  elMixer.classList.toggle('hidden');
  soundFX.playClick();
});

['music', 'sfx', 'engine'].forEach((ch) => {
  const slider = document.getElementById(`vol-${ch}`);
  slider.value = soundFX.volumes[ch];
  slider.addEventListener('input', (e) => {
    soundFX.init();
    soundFX.setVolume(ch, e.target.value);
  });
});