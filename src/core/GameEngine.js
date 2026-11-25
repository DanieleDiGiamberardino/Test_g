import {
  MODULES,
  INITIAL_CREW,
  TRAITS,
  BIOMES,
  DILEMMAS,
  TECH_TREE,
  CHASSIS,
  RELICS,
} from '../data/gameData.js';

const SAVE_KEY = 'derelict_3d_save_v1';

export class GameEngine {
  constructor(shipScene, soundFX, onRender) {
    this.shipScene = shipScene;
    this.sfx = soundFX;
    this.onRender = onRender;

    this.state = this.loadState();
    this.activeDilemma = null;
    this.dilemmaTimer = 0;
    this.dilemmaMaxTime = 60;
    this.sectorComplete = false;
    this.sectorOptions = [];

    // Draft Reliquie Roguelite
    this.pendingRelicChoices = null;
    this.siphonScrapAccum = 0;

    // Stato Cacciatore Meccanico
    this.hunterActive = false;
    this.hunterTimer = 0;
    this.hunterMaxTime = 30;
    this.hunterStealthProgress = 0;
    this.hunterCooldown = 0;
    this.autoGhostTriggered = false;

    this.logs = ['Sistema avviato. Nave ormeggiata in Hangar.'];

    this.clampStats();
    this.sync3D();
    this.lastTick = performance.now();
    requestAnimationFrame(() => this.loop());
  }

  getDefaultState() {
    return {
      mode: 'HANGAR',
      speed: 1,
      aiMode: 'AUTO',
      protocol: 'cauto',

      hull: 100,
      fuel: 100,
      heat: 0,
      ghostMode: false,

      bankScrap: 50,
      bankCores: 0,
      cargoScrap: 0,
      cargoCores: 0,

      power: { engines: 2, shields: 2, scanners: 2 },

      sector: 1,
      currentBiomeId: 'scrap_belt',
      node: 1,
      nodesPerSector: 5,
      nodeProgress: 0,

      chassis: 'mk1',
      unlockedChassis: ['mk1'],
      relics: [],

      modules: { drill: false, tanks: false, scanner: false, shield: false },
      techs: [],
      hullLevel: 1,
      crew: INITIAL_CREW.map((c) => ({ ...c, traits: [...c.traits] })),
    };
  }

  loadState() {
    const def = this.getDefaultState();
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        return {
          ...def,
          ...parsed,
          heat: typeof parsed.heat === 'number' ? parsed.heat : 0,
          ghostMode: Boolean(parsed.ghostMode),
          chassis: CHASSIS[parsed.chassis] ? parsed.chassis : 'mk1',
          unlockedChassis: Array.isArray(parsed.unlockedChassis) ? parsed.unlockedChassis : ['mk1'],
          relics: Array.isArray(parsed.relics) ? parsed.relics.filter((r) => RELICS[r]) : [],
          power: { ...def.power, ...(parsed.power || {}) },
          modules: { ...def.modules, ...(parsed.modules || {}) },
          techs: Array.isArray(parsed.techs) ? parsed.techs : [],
          crew: Array.isArray(parsed.crew) && parsed.crew.length === 3 ? parsed.crew : def.crew,
          currentBiomeId: BIOMES[parsed.currentBiomeId] ? parsed.currentBiomeId : 'scrap_belt',
        };
      }
    } catch (e) {
      console.warn('Errore caricamento salvataggio:', e);
    }
    return def;
  }

  saveState() {
    localStorage.setItem(SAVE_KEY, JSON.stringify(this.state));
  }

  resetSave() {
    localStorage.removeItem(SAVE_KEY);
    this.state = this.getDefaultState();
    this.activeDilemma = null;
    this.sectorComplete = false;
    this.sectorOptions = [];
    this.pendingRelicChoices = null;
    this.hunterActive = false;
    this.hunterStealthProgress = 0;
    this.logs = ['Salvataggio resettato. Nuova partita avviata.'];
    this.clampStats();
    this.sync3D();
    this.onRender();
  }

  addLog(msg, type = 'info') {
    const time = new Date().toLocaleTimeString('it-IT', { minute: '2-digit', second: '2-digit' });
    this.logs.unshift({ time, msg, type });
    if (this.logs.length > 25) this.logs.pop();
  }

  // --- STATISTICHE DERIVATE (TELAIO + MODULI + TECH + RELIQUIE) ---
  getChassis() {
    return CHASSIS[this.state.chassis] || CHASSIS.mk1;
  }

  hasTech(techId) {
    return this.state.techs.includes(techId);
  }

  hasRelic(relicId) {
    return this.state.relics.includes(relicId);
  }

  getMaxHull() {
    return 100 + (this.state.hullLevel - 1) * 25 + this.getChassis().hullBonus;
  }

  getMaxFuel() {
    return 100 + (this.state.modules.tanks ? 40 : 0) + this.getChassis().fuelBonus;
  }

  getPowerTotal() {
    return (
      6 +
      (this.state.hullLevel - 1) +
      (this.hasTech('cryo_fuel') ? 1 : 0) +
      this.getChassis().powerBonus +
      (this.hasRelic('overclock_core') ? 2 : 0)
    );
  }

  clampStats() {
    this.state.hull = Math.min(this.state.hull, this.getMaxHull());
    this.state.fuel = Math.min(this.state.fuel, this.getMaxFuel());

    // Se il limite energia scende (es. rientro senza Overclock), riduce i pip in eccesso
    const maxP = this.getPowerTotal();
    const order = ['scanners', 'shields', 'engines'];
    while (this.state.power.engines + this.state.power.shields + this.state.power.scanners > maxP) {
      for (const sys of order) {
        if (this.state.power[sys] > 0) {
          this.state.power[sys] -= 1;
          break;
        }
      }
    }
  }

  getCurrentBiome() {
    return BIOMES[this.state.currentBiomeId] || BIOMES.scrap_belt;
  }

  countTrait(traitId) {
    return this.state.crew.reduce((acc, m) => acc + (m.traits.includes(traitId) ? 1 : 0), 0);
  }

  countNegativeTraits() {
    return this.state.crew.reduce(
      (acc, m) => acc + m.traits.filter((t) => TRAITS[t]?.type === 'neg').length,
      0
    );
  }

  sync3D() {
    Object.keys(this.state.modules).forEach((modKey) => {
      this.shipScene.setModuleActive(modKey, this.state.modules[modKey]);
    });

    if (this.shipScene.setChassis) {
      this.shipScene.setChassis(this.state.chassis);
    }

    const tint = this.state.mode === 'HANGAR' ? 0x04070e : this.getCurrentBiome().bgHex;
    if (this.shipScene.setBiomeTint) {
      this.shipScene.setBiomeTint(tint);
    }

    const isMoving =
      this.state.mode === 'EXPEDITION' &&
      !this.activeDilemma &&
      !this.sectorComplete &&
      !this.pendingRelicChoices &&
      !this.state.ghostMode &&
      !this.hunterActive;

    const effectiveSpeed = isMoving
      ? this.state.speed * (0.6 + this.state.power.engines * 0.25 + this.countTrait('asso') * 0.15)
      : 0;

    this.shipScene.setSpeed(effectiveSpeed);
    if (this.shipScene.setGhostMode) this.shipScene.setGhostMode(this.state.ghostMode);
    if (this.shipScene.setHunterActive) this.shipScene.setHunterActive(this.hunterActive);

    this.sfx.setContext({
      mode: this.state.mode,
      biomeId: this.state.currentBiomeId,
      speed: effectiveSpeed,
      inDilemma: Boolean(this.activeDilemma || this.pendingRelicChoices),
      ghostMode: this.state.ghostMode,
      hunterActive: this.hunterActive,
    });
  }

  // --- RELIQUIE ROGUELITE ---
  offerRelicDraft() {
    if (this.state.relics.length >= 3) return false;
    const pool = Object.keys(RELICS).filter((id) => !this.state.relics.includes(id));
    if (pool.length === 0) return false;

    const shuffled = pool.sort(() => Math.random() - 0.5);
    this.pendingRelicChoices = shuffled.slice(0, 3);
    this.sfx.playUnlock();
    this.addLog('✨ Reliquia rara rilevata tra i rottami! Scegli un potenziamento per questa run.', 'good');
    this.sync3D();
    this.onRender();
    return true;
  }

  pickRelic(relicId) {
    if (!this.pendingRelicChoices || !RELICS[relicId]) return;
    if (this.state.relics.length < 3 && !this.state.relics.includes(relicId)) {
      this.state.relics.push(relicId);
      const r = RELICS[relicId];
      this.sfx.playSuccess();
      this.addLog(`${r.icon} Reliquia equipaggiata: ${r.name}!`, 'good');
    }
    this.pendingRelicChoices = null;
    this.clampStats();
    this.sync3D();
    this.saveState();
    this.onRender();
  }

  skipRelic() {
    this.pendingRelicChoices = null;
    this.sfx.playClick();
    this.sync3D();
    this.onRender();
  }

  // --- TELAI 3D ---
  selectOrBuyChassis(chassisId) {
    if (this.state.mode !== 'HANGAR') return;
    const ch = CHASSIS[chassisId];
    if (!ch) return;

    if (this.state.unlockedChassis.includes(chassisId)) {
      this.state.chassis = chassisId;
      this.clampStats();
      this.state.hull = this.getMaxHull();
      this.sfx.playClick();
      this.addLog(`Telaio 3D selezionato: ${ch.name}.`, 'info');
      this.sync3D();
      this.saveState();
      this.onRender();
      return;
    }

    if (this.state.bankScrap < ch.costScrap || this.state.bankCores < ch.costCores) {
      this.addLog(`Risorse insufficienti per costruire ${ch.name}.`, 'warn');
      this.onRender();
      return;
    }

    this.state.bankScrap -= ch.costScrap;
    this.state.bankCores -= ch.costCores;
    this.state.unlockedChassis.push(chassisId);
    this.state.chassis = chassisId;
    this.clampStats();
    this.state.hull = this.getMaxHull();
    this.state.fuel = this.getMaxFuel();
    this.sfx.playUnlock();
    this.addLog(`🚀 Nuovo Telaio 3D sbloccato ed equipaggiato: ${ch.name}!`, 'good');
    this.sync3D();
    this.saveState();
    this.onRender();
  }

  // --- MODALITÀ FANTASMA & CACCIATORE ---
  toggleGhostMode(forceState = null, fromAI = false) {
    if (this.state.mode !== 'EXPEDITION') return;
    const next = forceState !== null ? forceState : !this.state.ghostMode;
    if (next === this.state.ghostMode) return;

    this.state.ghostMode = next;
    this.autoGhostTriggered = fromAI && next;
    this.sfx.playGhostToggle(next);
    this.addLog(
      next
        ? '👻 Modalità Fantasma ATTIVA: motori spenti, dispersione termica rapida.'
        : 'Sistemi riavviati: navigazione ripresa.',
      'info'
    );
    this.sync3D();
    this.saveState();
    this.onRender();
  }

  triggerHunter() {
    this.hunterActive = true;
    this.hunterTimer = this.hunterMaxTime;
    this.hunterStealthProgress = 0;
    this.sfx.playHunterAlert();
    this.addLog('🚨 ALLARME TERMICO! Un Cacciatore Meccanico ha agganciato la tua firma!', 'danger');
    this.sync3D();
    this.onRender();
  }

  getHunterTrapChance() {
    let chance = 42 + this.state.power.shields * 8 + this.state.power.scanners * 6;
    if (this.state.modules.shield) chance += 14;
    if (this.state.modules.scanner) chance += 8;
    if (this.hasRelic('emp_capacitor')) chance += 25;
    chance += this.countTrait('veterano') * 7;
    return Math.max(20, Math.min(95, Math.round(chance)));
  }

  applyHullDamage(rawDmg) {
    const biome = this.getCurrentBiome();
    let mitigation = this.state.power.shields * 0.08 - this.countTrait('scosso') * 0.12;
    if (this.state.modules.shield) mitigation += 0.35;
    mitigation = Math.max(0, Math.min(0.75, mitigation));

    const finalDmg = Math.max(1, Math.round(rawDmg * biome.hazard * (1 - mitigation)));
    this.state.hull = Math.max(0, this.state.hull - finalDmg);
    this.shipScene.triggerDamage();
    this.sfx.playDamage();

    // Reliquia Scudo Vampirico
    if (this.hasRelic('vamp_shield') && this.state.hull > 0) {
      this.state.fuel = Math.min(this.getMaxFuel(), this.state.fuel + 12);
      this.state.heat = Math.max(0, this.state.heat - 15);
      this.addLog('🩸 Scudo Vampirico: impatto convertito in +12 Fuel e -15% Calore!', 'good');
    }
    return finalDmg;
  }

  resolveHunterAction(action) {
    if (!this.hunterActive) return;

    if (action === 'ghost') {
      this.toggleGhostMode(true, false);
      return;
    }

    if (action === 'decoy') {
      const drop = Math.max(8, Math.floor(this.state.cargoScrap * 0.25));
      this.state.cargoScrap = Math.max(0, this.state.cargoScrap - drop);
      this.state.heat = Math.max(0, this.state.heat - 32);
      this.hunterActive = false;
      this.hunterCooldown = 22;
      this.sfx.playLaunch();
      this.addLog(`Esca sganciata (-${drop} Rottami in stiva): il Cacciatore vira fuori rotta!`, 'warn');
      this.sync3D();
      this.saveState();
      this.onRender();
      return;
    }

    if (action === 'trap') {
      const chance = this.getHunterTrapChance();
      const win = Math.random() * 100 <= chance;
      this.hunterActive = false;
      this.hunterCooldown = 28;
      this.state.heat = Math.max(0, this.state.heat - 38);

      if (win) {
        const bonusScrap = Math.round(35 * this.getChassis().scrapMult);
        this.state.cargoCores += 2;
        this.state.cargoScrap += bonusScrap;
        if (this.hasRelic('emp_capacitor')) {
          this.state.hull = Math.min(this.getMaxHull(), this.state.hull + 20);
        }
        if (this.shipScene.triggerHunterExplosion) this.shipScene.triggerHunterExplosion();
        this.sfx.playSectorClear();
        this.addLog(`⚡ TRAPPOLA EMP RIUSCITA! Cacciatore distrutto: +2 Nuclei, +${bonusScrap} Rottami!`, 'good');

        // Distruggere un Cacciatore offre subito una Reliquia se hai slot liberi!
        this.offerRelicDraft();
      } else {
        const dmg = this.applyHullDamage(30);
        this.addLog(`Trappola fallita! Il Cacciatore colpisce lo scafo (-${dmg} Scafo) prima di allontanarsi.`, 'danger');
        if (this.state.hull <= 0) {
          this.returnToHangar(true);
          return;
        }
        if (this.checkAutoRetreat()) return;
      }

      this.sync3D();
      this.saveState();
      this.onRender();
    }
  }

  // --- REATTORE ---
  adjustPower(system, delta) {
    const used = this.state.power.engines + this.state.power.shields + this.state.power.scanners;
    const nextVal = this.state.power[system] + delta;
    if (nextVal < 0 || nextVal > 4) return;
    if (delta > 0 && used >= this.getPowerTotal()) return;

    this.state.power[system] = nextVal;
    this.sfx.playReactorPip(nextVal);
    this.sync3D();
    this.saveState();
    this.onRender();
  }

  // --- HANGAR & TECH ---
  repairHull() {
    if (this.state.mode !== 'HANGAR') return;
    const missing = this.getMaxHull() - this.state.hull;
    if (missing <= 0) return;
    const cost = Math.ceil(missing * 0.4);
    if (this.state.bankScrap < cost) {
      this.addLog(`Servono ${cost} Rottami per riparare lo scafo.`, 'warn');
      this.onRender();
      return;
    }
    this.state.bankScrap -= cost;
    this.state.hull = this.getMaxHull();
    this.sfx.playSuccess();
    this.addLog(`Scafo riparato al 100% (-${cost} Rottami).`, 'good');
    this.saveState();
    this.onRender();
  }

  refuel() {
    if (this.state.mode !== 'HANGAR') return;
    const missing = this.getMaxFuel() - this.state.fuel;
    if (missing <= 0) return;
    const cost = Math.ceil(missing * 0.25);
    if (this.state.bankScrap < cost) {
      this.addLog(`Servono ${cost} Rottami per fare il pieno.`, 'warn');
      this.onRender();
      return;
    }
    this.state.bankScrap -= cost;
    this.state.fuel = this.getMaxFuel();
    this.sfx.playSuccess();
    this.addLog(`Serbatoi al 100% (-${cost} Rottami).`, 'good');
    this.saveState();
    this.onRender();
  }

  cureCrew() {
    if (this.state.mode !== 'HANGAR') return;
    const negCount = this.countNegativeTraits();
    if (negCount === 0) return;
    const cost = negCount * 15;
    if (this.state.bankScrap < cost) {
      this.addLog(`Servono ${cost} Rottami per l'Infermeria.`, 'warn');
      this.onRender();
      return;
    }
    this.state.bankScrap -= cost;
    this.state.crew.forEach((m) => {
      m.traits = m.traits.filter((t) => TRAITS[t]?.type !== 'neg');
    });
    this.sfx.playSuccess();
    this.addLog(`Equipaggio ristabilito in Infermeria (-${cost} Rottami).`, 'good');
    this.saveState();
    this.onRender();
  }

  buyModule(modId) {
    if (this.state.mode !== 'HANGAR') return;
    const mod = MODULES[modId];
    if (!mod || this.state.modules[modId]) return;
    if (this.state.bankScrap < mod.costScrap) {
      this.addLog(`Rottami insufficienti per ${mod.name}.`, 'warn');
      this.onRender();
      return;
    }
    this.state.bankScrap -= mod.costScrap;
    this.state.modules[modId] = true;
    if (modId === 'tanks') this.state.fuel += 40;
    this.clampStats();
    this.sfx.playUnlock();
    this.addLog(`Modulo 3D installato: ${mod.name}!`, 'good');
    this.sync3D();
    this.saveState();
    this.onRender();
  }

  upgradeHull() {
    if (this.state.mode !== 'HANGAR') return;
    const costCores = this.state.hullLevel;
    if (this.state.bankCores < costCores) {
      this.addLog(`Servono ${costCores} Nuclei per rinforzare il telaio.`, 'warn');
      this.onRender();
      return;
    }
    this.state.bankCores -= costCores;
    this.state.hullLevel += 1;
    this.state.hull += 25;
    this.clampStats();
    this.sfx.playUnlock();
    this.addLog(`Telaio Lv.${this.state.hullLevel}: +25 Scafo Max e +1 Energia!`, 'good');
    this.saveState();
    this.onRender();
  }

  unlockTech(techId) {
    if (this.state.mode !== 'HANGAR') return;
    const tech = TECH_TREE.find((t) => t.id === techId);
    if (!tech || this.hasTech(techId)) return;
    if (tech.requires && !this.hasTech(tech.requires)) return;

    if (this.state.bankScrap < tech.costScrap || this.state.bankCores < tech.costCores) {
      this.addLog(`Risorse insufficienti per ricercare ${tech.name}.`, 'warn');
      this.onRender();
      return;
    }

    this.state.bankScrap -= tech.costScrap;
    this.state.bankCores -= tech.costCores;
    this.state.techs.push(techId);
    this.clampStats();
    this.sfx.playUnlock();
    this.addLog(`Tecnologia sbloccata: ${tech.name}!`, 'good');
    this.saveState();
    this.onRender();
  }

  // --- SPEDIZIONE ---
  launchExpedition() {
    if (this.state.fuel < 15) {
      this.addLog('Carburante troppo basso per decollare!', 'warn');
      this.onRender();
      return;
    }
    this.state.mode = 'EXPEDITION';
    this.state.sector = 1;
    this.state.currentBiomeId = 'scrap_belt';
    this.state.node = 1;
    this.state.nodeProgress = 0;
    this.state.cargoScrap = 0;
    this.state.cargoCores = 0;
    this.state.relics = [];
    this.state.heat = 0;
    this.state.ghostMode = false;
    this.hunterActive = false;
    this.hunterCooldown = 8;
    this.sectorComplete = false;
    this.sectorOptions = [];
    this.pendingRelicChoices = null;
    this.activeDilemma = null;

    this.clampStats();
    this.sfx.playLaunch();
    this.addLog(`Decollo confermato su ${this.getChassis().name}! Entrata nella Fascia di Rottami.`, 'info');
    this.sync3D();
    this.saveState();
    this.onRender();
  }

  generateSectorOptions() {
    const allIds = Object.keys(BIOMES).filter((id) => id !== this.state.currentBiomeId);
    this.sectorOptions = allIds.sort(() => Math.random() - 0.5).slice(0, 2);
  }

  pushNextSector(biomeId) {
    this.state.sector += 1;
    this.state.currentBiomeId = BIOMES[biomeId] ? biomeId : 'ionic_nebula';
    this.state.node = 1;
    this.state.nodeProgress = 0;
    this.state.ghostMode = false;
    this.sectorComplete = false;
    this.sectorOptions = [];
    const biome = this.getCurrentBiome();
    this.sfx.playLaunch();
    this.addLog(`Salto nel Settore ${this.state.sector}: ${biome.name}!`, 'info');
    this.sync3D();
    this.saveState();
    this.onRender();
  }

  returnToHangar(emergency = false, reason = null) {
    if (emergency) {
      const savedScrap = Math.floor(this.state.cargoScrap * 0.35);
      this.state.bankScrap += savedScrap;
      this.state.hull = Math.max(15, Math.floor(this.getMaxHull() * 0.25));
      this.state.fuel = Math.max(10, this.state.fuel);
      this.sfx.playDamage();
      this.addLog(`RECUPERO D'EMERGENZA! Salvati solo ${savedScrap} Rottami, Nuclei persi.`, 'danger');
    } else {
      this.state.bankScrap += this.state.cargoScrap;
      this.state.bankCores += this.state.cargoCores;
      this.sfx.playSuccess();
      const prefix = reason ? `[${reason}] ` : '';
      this.addLog(
        `${prefix}Rientro riuscito! Depositati +${this.state.cargoScrap} Rottami e +${this.state.cargoCores} Nuclei.`,
        'good'
      );
    }

    this.state.cargoScrap = 0;
    this.state.cargoCores = 0;
    this.state.relics = [];
    this.state.heat = 0;
    this.state.ghostMode = false;
    this.hunterActive = false;
    this.pendingRelicChoices = null;
    this.state.mode = 'HANGAR';
    this.activeDilemma = null;
    this.sectorComplete = false;
    this.sectorOptions = [];
    this.clampStats();
    this.sync3D();
    this.saveState();
    this.onRender();
  }

  checkAutoRetreat() {
    if (!this.hasTech('auto_retreat')) return false;
    const lowHull = this.state.hull / this.getMaxHull() <= 0.25;
    const lowFuel = this.state.fuel / this.getMaxFuel() <= 0.12;
    if (lowHull || lowFuel) {
      this.returnToHangar(false, 'SALVA-VITA IA');
      return true;
    }
    return false;
  }

  // --- DILEMMI ---
  triggerDilemma() {
    const raw = DILEMMAS[Math.floor(Math.random() * DILEMMAS.length)];
    this.activeDilemma = raw;
    this.dilemmaTimer = this.dilemmaMaxTime;
    this.sfx.playDilemma();
    this.sync3D();
    this.onRender();
  }

  getAiRecommendedIndex() {
    if (!this.activeDilemma) return 0;
    const idx = this.activeDilemma.choices.findIndex((c) => c.tag === this.state.protocol);
    return idx >= 0 ? idx : 0;
  }

  getChoiceChance(choice, choiceIndex = -1) {
    if (choice.baseChance >= 100) return 100;
    let chance = choice.baseChance;
    chance += this.state.power.scanners * 4;
    chance += this.getChassis().chanceBonus;
    if (this.state.modules.scanner) chance += 10;
    if (choice.modBonus && this.state.modules[choice.modBonus]) chance += 15;
    if (choice.roleBonus) chance += 10;
    if (this.hasTech('smart_ai') && choiceIndex === this.getAiRecommendedIndex()) chance += 8;
    if (this.hasRelic('quantum_scanner') && choice.tag === 'avido') chance += 10;
    chance += this.countTrait('veterano') * 7;
    chance -= this.countTrait('affaticato') * 7;
    chance -= (this.state.sector - 1) * 4;
    return Math.max(15, Math.min(98, Math.round(chance)));
  }

  applyTraitToCrew(rolePreferred, traitId) {
    if (!traitId || !TRAITS[traitId]) return;
    let member = this.state.crew.find((c) => c.role === rolePreferred);
    if (!member) member = this.state.crew[Math.floor(Math.random() * this.state.crew.length)];

    if (member.traits.includes(traitId)) return;
    if (member.traits.length >= 2) member.traits.shift();
    member.traits.push(traitId);

    const t = TRAITS[traitId];
    this.addLog(
      `${member.name} guadagna tratto [${t.label}] (${t.desc})`,
      t.type === 'pos' ? 'good' : 'warn'
    );
  }

  resolveDilemma(choiceIndex) {
    if (!this.activeDilemma) return;
    const choice = this.activeDilemma.choices[choiceIndex];
    const chance = this.getChoiceChance(choice, choiceIndex);
    const isSuccess = Math.random() * 100 <= chance;
    const outcome = isSuccess ? choice.success : choice.fail;
    const biome = this.getCurrentBiome();

    // Calore della scelta (azzerato su scelte Avide con Scanner Quantico)
    const heatMult = this.getChassis().heatMult * (this.hasRelic('overclock_core') ? 1.25 : 1.0);
    if ((choice.tag === 'avido' || choice.modBonus === 'drill') && !(this.hasRelic('quantum_scanner') && choice.tag === 'avido')) {
      this.state.heat = Math.min(100, this.state.heat + Math.round(14 * heatMult));
    } else if (choice.tag === 'cauto') {
      this.state.heat = Math.max(0, this.state.heat - 10);
    }

    const scrapTraitMult =
      (1 + this.countTrait('fortunato') * 0.15 - this.countTrait('irradiato') * 0.15) *
      this.getChassis().scrapMult;

    if (outcome.scrap) {
      const gained = Math.max(1, Math.round(outcome.scrap * biome.lootMult * scrapTraitMult));
      this.state.cargoScrap += gained;
    }
    if (outcome.cores) this.state.cargoCores += outcome.cores;
    if (outcome.fuel) {
      this.state.fuel = Math.max(0, Math.min(this.getMaxFuel(), this.state.fuel + outcome.fuel));
    }
    if (outcome.hull) {
      if (outcome.hull < 0) {
        this.applyHullDamage(Math.abs(outcome.hull));
      } else {
        this.state.hull = Math.min(this.getMaxHull(), this.state.hull + outcome.hull);
      }
    }

    if (isSuccess) this.sfx.playSuccess();
    this.addLog(`[${this.activeDilemma.title}] ${outcome.text}`, isSuccess ? 'good' : 'danger');

    if (isSuccess && outcome.traitPos && Math.random() < 0.45) {
      this.applyTraitToCrew(choice.roleBonus, outcome.traitPos);
    } else if (!isSuccess && outcome.traitNeg && Math.random() < 0.65) {
      this.applyTraitToCrew(choice.roleBonus, outcome.traitNeg);
    }

    this.activeDilemma = null;

    if (this.state.hull <= 0 || this.state.fuel <= 0) {
      this.returnToHangar(true);
      return;
    }
    if (this.checkAutoRetreat()) return;

    if (this.state.node >= this.state.nodesPerSector) {
      this.sectorComplete = true;
      if (this.hasTech('core_extractor')) {
        this.state.cargoCores += 1;
        this.addLog('Estrattore Xeno: +1 Nucleo bonus estratto dal settore!', 'good');
      }
      this.generateSectorOptions();
      this.sfx.playSectorClear();
      this.addLog(`Settore ${this.state.sector} completato!`, 'info');

      // A fine settore offre una Reliquia Roguelite (se < 3)
      this.offerRelicDraft();
    } else {
      this.state.node += 1;
      this.state.nodeProgress = 0;
    }

    this.sync3D();
    this.saveState();
    this.onRender();
  }

  // --- CONTROLLI ---
  setSpeed(speed) {
    this.state.speed = speed;
    this.sfx.playClick();
    this.sync3D();
    this.onRender();
  }

  toggleAiMode() {
    this.state.aiMode = this.state.aiMode === 'AUTO' ? 'PAUSA' : 'AUTO';
    this.sfx.playClick();
    this.saveState();
    this.onRender();
  }

  setProtocol(proto) {
    this.state.protocol = proto;
    this.sfx.playClick();
    this.saveState();
    this.onRender();
  }

  // --- LOOP PRINCIPALE ---
  loop() {
    requestAnimationFrame(() => this.loop());
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.lastTick) / 1000);
    this.lastTick = now;

    if (this.hunterCooldown > 0) {
      this.hunterCooldown = Math.max(0, this.hunterCooldown - dt);
    }

    if (this.state.mode !== 'EXPEDITION') return;
    if (this.pendingRelicChoices) return;

    // 1. CACCIATORE ATTIVO
    if (this.hunterActive) {
      if (this.state.ghostMode) {
        this.state.heat = Math.max(0, this.state.heat - dt * 13);
        this.hunterStealthProgress += dt * 16 * this.getChassis().stealthSpeedMult;

        if (this.hasRelic('thermal_siphon')) {
          this.siphonScrapAccum += dt * 3;
          if (this.siphonScrapAccum >= 1) {
            const gain = Math.floor(this.siphonScrapAccum);
            this.state.cargoScrap += gain;
            this.siphonScrapAccum -= gain;
          }
        }

        if (this.hunterStealthProgress >= 100) {
          this.hunterActive = false;
          this.hunterStealthProgress = 0;
          this.hunterCooldown = 25;
          this.addLog('👻 Il Cacciatore non ti ha rilevato e lascia il settore!', 'good');
          this.sfx.playSuccess();

          if (this.autoGhostTriggered) {
            this.state.ghostMode = false;
            this.autoGhostTriggered = false;
            this.sfx.playGhostToggle(false);
          }
          this.sync3D();
          this.saveState();
          this.onRender();
        } else {
          this.onRender(true);
        }
      } else {
        this.hunterTimer -= dt;
        if (this.hunterTimer <= 0) {
          if (this.state.aiMode === 'AUTO') {
            if (this.state.protocol === 'avido' && this.state.cargoScrap >= 20) {
              this.resolveHunterAction('decoy');
            } else {
              this.toggleGhostMode(true, true);
            }
          } else {
            this.resolveHunterAction('trap');
          }
        } else {
          this.onRender(true);
        }
      }
      return;
    }

    // 2. DILEMMA ATTIVO
    if (this.activeDilemma) {
      if (this.state.aiMode === 'AUTO') {
        this.dilemmaTimer -= dt;
        if (this.dilemmaTimer <= 0) {
          this.resolveDilemma(this.getAiRecommendedIndex());
        } else {
          this.onRender(true);
        }
      }
      return;
    }

    if (this.sectorComplete) return;

    // 3. MODALITÀ FANTASMA VOLONTARIA
    if (this.state.ghostMode) {
      const coolRate = this.state.currentBiomeId === 'cryo_drift' ? 20 : 13;
      const prevHeat = this.state.heat;
      this.state.heat = Math.max(0, this.state.heat - dt * coolRate);

      if (this.hasRelic('thermal_siphon') && prevHeat > 0) {
        this.siphonScrapAccum += dt * 3;
        if (this.siphonScrapAccum >= 1) {
          const gain = Math.floor(this.siphonScrapAccum);
          this.state.cargoScrap += gain;
          this.siphonScrapAccum -= gain;
        }
      }
      this.onRender(true);
      return;
    }

    // 4. NAVIGAZIONE NORMALE
    const biome = this.getCurrentBiome();
    const engineFactor = 0.7 + this.state.power.engines * 0.35 + this.countTrait('asso') * 0.15;
    this.state.nodeProgress += dt * 16 * this.state.speed * engineFactor;

    let heatRate = 0;
    if (this.state.speed === 1) {
      heatRate = this.state.power.engines <= 1 ? -2.2 : 0.6 * this.state.power.engines;
    } else if (this.state.speed === 2) {
      heatRate = 2.6 + this.state.power.engines * 0.85;
    } else {
      heatRate = 5.4 + this.state.power.engines * 1.25;
    }
    if (heatRate > 0) {
      heatRate *= this.getChassis().heatMult * (this.hasRelic('overclock_core') ? 1.25 : 1.0);
    }
    if (this.state.currentBiomeId === 'cryo_drift') {
      heatRate = heatRate > 0 ? heatRate * 0.45 : heatRate * 1.8;
    }
    this.state.heat = Math.max(0, Math.min(100, this.state.heat + heatRate * dt));

    if (this.state.heat >= 85 && this.hunterCooldown <= 0) {
      this.triggerHunter();
      return;
    }

    let fuelMult = (this.state.modules.tanks ? 0.8 : 1.0) * biome.fuelMult;
    if (this.hasTech('cryo_fuel')) fuelMult *= 0.85;
    if (this.hasRelic('swarm_drones')) fuelMult *= 1.15;
    this.state.fuel = Math.max(0, this.state.fuel - dt * 0.9 * this.state.speed * fuelMult);

    if (this.state.fuel <= 0) {
      this.returnToHangar(true);
      return;
    }
    if (this.checkAutoRetreat()) return;

    if (this.state.nodeProgress >= 100) {
      this.state.nodeProgress = 100;

      if (this.hasTech('nanobot_hull') && this.state.hull < this.getMaxHull()) {
        this.state.hull = Math.min(this.getMaxHull(), this.state.hull + 4);
      }

      const drillMult = this.state.modules.drill ? 1.4 : 1.0;
      const techScrapMult = this.hasTech('salvage_magnet') ? 1.25 : 1.0;
      const droneMult = this.hasRelic('swarm_drones') ? 2.0 : 1.0;
      const scrapTraitMult =
        (1 + this.countTrait('fortunato') * 0.15 - this.countTrait('irradiato') * 0.15) *
        this.getChassis().scrapMult;

      const passiveScrap = Math.max(
        1,
        Math.round(
          (6 + this.state.power.scanners * 2) *
            biome.lootMult *
            drillMult *
            techScrapMult *
            droneMult *
            scrapTraitMult
        )
      );
      this.state.cargoScrap += passiveScrap;
      this.sfx.playScrapTick();
      this.addLog(
        `Nodo ${this.state.node}/${this.state.nodesPerSector}: +${passiveScrap} Rottami passivi.`,
        'info'
      );
      this.triggerDilemma();
    } else {
      this.onRender(true);
    }
  }
}