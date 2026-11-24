import { MODULES, INITIAL_CREW, TRAITS, BIOMES, DILEMMAS, TECH_TREE } from '../data/gameData.js';

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
    this.logs = ['Sistema avviato. Nave ormeggiata in Hangar.'];

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
      maxHull: 100,
      fuel: 100,
      maxFuel: 100,

      bankScrap: 50,
      bankCores: 0,
      cargoScrap: 0,
      cargoCores: 0,

      powerTotal: 6,
      power: { engines: 2, shields: 2, scanners: 2 },

      sector: 1,
      currentBiomeId: 'scrap_belt',
      node: 1,
      nodesPerSector: 5,
      nodeProgress: 0,

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
    this.logs = ['Salvataggio resettato. Nuova partita avviata.'];
    this.sync3D();
    this.onRender();
  }

  addLog(msg, type = 'info') {
    const time = new Date().toLocaleTimeString('it-IT', { minute: '2-digit', second: '2-digit' });
    this.logs.unshift({ time, msg, type });
    if (this.logs.length > 25) this.logs.pop();
  }

  hasTech(techId) {
    return this.state.techs.includes(techId);
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

        const tint = this.state.mode === 'HANGAR' ? 0x04070e : this.getCurrentBiome().bgHex;
        if (this.shipScene.setBiomeTint) {
        this.shipScene.setBiomeTint(tint);
        }

        const isMoving =
        this.state.mode === 'EXPEDITION' && !this.activeDilemma && !this.sectorComplete;
        const effectiveSpeed = isMoving
        ? this.state.speed * (0.6 + this.state.power.engines * 0.25 + this.countTrait('asso') * 0.15)
        : 0;

        this.shipScene.setSpeed(effectiveSpeed);

        this.sfx.setContext({
        mode: this.state.mode,
        biomeId: this.state.currentBiomeId,
        speed: effectiveSpeed,
        inDilemma: Boolean(this.activeDilemma),
        });
    }

  // --- REATTORE ---
  adjustPower(system, delta) {
    const used = this.state.power.engines + this.state.power.shields + this.state.power.scanners;
    const nextVal = this.state.power[system] + delta;
    if (nextVal < 0 || nextVal > 4) return;
    if (delta > 0 && used >= this.state.powerTotal) return;

    this.state.power[system] = nextVal;
    this.sfx.playReactorPip(nextVal);
    this.sync3D();
    this.saveState();
    this.onRender();
  }

  // --- HANGAR & ALBERO TECNOLOGICO ---
  repairHull() {
    if (this.state.mode !== 'HANGAR') return;
    const missing = this.state.maxHull - this.state.hull;
    if (missing <= 0) return;
    const cost = Math.ceil(missing * 0.4);
    if (this.state.bankScrap < cost) {
      this.addLog(`Servono ${cost} Rottami per riparare lo scafo.`, 'warn');
      this.onRender();
      return;
    }
    this.state.bankScrap -= cost;
    this.state.hull = this.state.maxHull;
    this.sfx.playSuccess();
    this.addLog(`Scafo riparato al 100% (-${cost} Rottami).`, 'good');
    this.saveState();
    this.onRender();
  }

  refuel() {
    if (this.state.mode !== 'HANGAR') return;
    const missing = this.state.maxFuel - this.state.fuel;
    if (missing <= 0) return;
    const cost = Math.ceil(missing * 0.25);
    if (this.state.bankScrap < cost) {
      this.addLog(`Servono ${cost} Rottami per fare il pieno.`, 'warn');
      this.onRender();
      return;
    }
    this.state.bankScrap -= cost;
    this.state.fuel = this.state.maxFuel;
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
    if (modId === 'tanks') {
      this.state.maxFuel += 40;
      this.state.fuel += 40;
    }
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
    this.state.maxHull += 25;
    this.state.hull += 25;
    this.state.powerTotal += 1;
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

    if (techId === 'cryo_fuel') {
      this.state.powerTotal += 1;
    }

    this.sfx.playUnlock();
    this.addLog(`Tecnologia sbloccata: ${tech.name}!`, 'good');
    this.saveState();
    this.onRender();
  }

  // --- SPEDIZIONE & BIVI BIOMA ---
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
    this.sectorComplete = false;
    this.sectorOptions = [];
    this.activeDilemma = null;

    this.sfx.playLaunch();
    this.addLog('Decollo confermato! Entrata nella Fascia di Rottami.', 'info');
    this.sync3D();
    this.saveState();
    this.onRender();
  }

  generateSectorOptions() {
    const allIds = Object.keys(BIOMES).filter((id) => id !== this.state.currentBiomeId);
    const shuffled = allIds.sort(() => Math.random() - 0.5);
    this.sectorOptions = shuffled.slice(0, 2);
  }

  pushNextSector(biomeId) {
    this.state.sector += 1;
    this.state.currentBiomeId = BIOMES[biomeId] ? biomeId : 'ionic_nebula';
    this.state.node = 1;
    this.state.nodeProgress = 0;
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
      this.state.hull = Math.max(15, Math.floor(this.state.maxHull * 0.25));
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
    this.state.mode = 'HANGAR';
    this.activeDilemma = null;
    this.sectorComplete = false;
    this.sectorOptions = [];
    this.sync3D();
    this.saveState();
    this.onRender();
  }

  checkAutoRetreat() {
    if (!this.hasTech('auto_retreat')) return false;
    const lowHull = this.state.hull / this.state.maxHull <= 0.25;
    const lowFuel = this.state.fuel / this.state.maxFuel <= 0.12;
    if (lowHull || lowFuel) {
      this.returnToHangar(false, 'SALVA-VITA IA');
      return true;
    }
    return false;
  }

  // --- DILEMMI & TRATTI ---
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
    if (this.state.modules.scanner) chance += 10;
    if (choice.modBonus && this.state.modules[choice.modBonus]) chance += 15;
    if (choice.roleBonus) chance += 10;
    if (this.hasTech('smart_ai') && choiceIndex === this.getAiRecommendedIndex()) {
      chance += 8;
    }
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

    const scrapTraitMult =
      1 + this.countTrait('fortunato') * 0.15 - this.countTrait('irradiato') * 0.15;

    if (outcome.scrap) {
      const gained = Math.max(1, Math.round(outcome.scrap * biome.lootMult * scrapTraitMult));
      this.state.cargoScrap += gained;
    }
    if (outcome.cores) {
      this.state.cargoCores += outcome.cores;
    }
    if (outcome.fuel) {
      this.state.fuel = Math.max(0, Math.min(this.state.maxFuel, this.state.fuel + outcome.fuel));
    }
    if (outcome.hull) {
      let deltaHull = outcome.hull;
      if (deltaHull < 0) {
        let mitigation = this.state.power.shields * 0.08 - this.countTrait('scosso') * 0.12;
        if (this.state.modules.shield) mitigation += 0.35;
        mitigation = Math.max(0, Math.min(0.75, mitigation));
        deltaHull = Math.round(deltaHull * biome.hazard * (1 - mitigation));
        this.shipScene.triggerDamage();
        this.sfx.playDamage();
      }
      this.state.hull = Math.max(0, Math.min(this.state.maxHull, this.state.hull + deltaHull));
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

    // Controllo tecnologia Salva-Vita prima di continuare
    if (this.checkAutoRetreat()) return;

    if (this.state.node >= this.state.nodesPerSector) {
      this.sectorComplete = true;
      if (this.hasTech('core_extractor')) {
        this.state.cargoCores += 1;
        this.addLog('Estrattore Xeno: +1 Nucleo bonus estratto dal settore!', 'good');
      }
      this.generateSectorOptions();
      this.sfx.playSectorClear();
      this.addLog(`Settore ${this.state.sector} completato! Scegli la prossima rotta o rientra.`, 'info');
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

  // --- LOOP ---
  loop() {
    requestAnimationFrame(() => this.loop());
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.lastTick) / 1000);
    this.lastTick = now;

    if (this.state.mode === 'EXPEDITION') {
      if (this.activeDilemma) {
        if (this.state.aiMode === 'AUTO') {
          this.dilemmaTimer -= dt;
          if (this.dilemmaTimer <= 0) {
            this.resolveDilemma(this.getAiRecommendedIndex());
          } else {
            this.onRender(true);
          }
        }
      } else if (!this.sectorComplete) {
        const biome = this.getCurrentBiome();
        const engineFactor =
          0.7 + this.state.power.engines * 0.35 + this.countTrait('asso') * 0.15;
        this.state.nodeProgress += dt * 16 * this.state.speed * engineFactor;

        let fuelMult = (this.state.modules.tanks ? 0.8 : 1.0) * biome.fuelMult;
        if (this.hasTech('cryo_fuel')) fuelMult *= 0.85;
        this.state.fuel = Math.max(0, this.state.fuel - dt * 0.9 * this.state.speed * fuelMult);

        if (this.state.fuel <= 0) {
          this.returnToHangar(true);
          return;
        }
        if (this.checkAutoRetreat()) return;

        if (this.state.nodeProgress >= 100) {
          this.state.nodeProgress = 100;

          if (this.hasTech('nanobot_hull') && this.state.hull < this.state.maxHull) {
            this.state.hull = Math.min(this.state.maxHull, this.state.hull + 4);
          }

          const drillMult = this.state.modules.drill ? 1.4 : 1.0;
          const techScrapMult = this.hasTech('salvage_magnet') ? 1.25 : 1.0;
          const scrapTraitMult =
            1 + this.countTrait('fortunato') * 0.15 - this.countTrait('irradiato') * 0.15;

          const passiveScrap = Math.max(
            1,
            Math.round(
              (6 + this.state.power.scanners * 2) *
                biome.lootMult *
                drillMult *
                techScrapMult *
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
  }
}