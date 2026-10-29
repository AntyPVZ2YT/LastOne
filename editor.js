(() => {
  const $ = (id) => document.getElementById(id);
  const fileInput = $('save-file'), fileInfo = $('file-info'), status = $('editor-status');
  const validation = $('validation-message'), exportButton = $('export-button'), resetButton = $('reset-button');
  const MAX_AMOUNT = 2012500000;
  const MAX_PLANT_LEVEL = 20;
  const MAX_PLANT_MASTERY = 200;
  const MAX_PLANT_SEEDS = 10000000;
  const resourceFields = { coins: 'c', gems: 'g', gauntlets: 't', mints: 'm', fuel: 'pf', perk: 'pt' };
  const STANDARD_POWERUPS = ['powerupwizardfinger','poweruppinchzombie','powerupflickzombie','powerupsnowball','powerupflamethrower','powerupvasebreakerreveal','powerupvasebreakerbutter','powerupvasebreakermove','powerupbeghouledshuffle','powerupbeghouledshovel','powerupbeghouledwizardfinger'];
  const POWERUP_LABELS = { powerupwizardfinger:'Wizard Finger', poweruppinchzombie:'Pinch', powerupflickzombie:'Flick', powerupsnowball:'Snowball', powerupflamethrower:'Flame', powerupvasebreakerreveal:'Vasebreaker Reveal', powerupvasebreakerbutter:'Vasebreaker Butter', powerupvasebreakermove:'Vasebreaker Move', powerupbeghouledshuffle:'Beghouled Shuffle', powerupbeghouledshovel:'Beghouled Shovel', powerupbeghouledwizardfinger:'Beghouled Wizard Finger' };
  // RTID display names for the post-Sundew Tangler plant batch. Single-word names use lowercase RTIDs.
  const PLANT_RTID_LABELS = {
    beansprout:'Bean Sprout', cranjelly:'Cran Jelly', buduhboom:"Bud'uh Boom", dragonbruit:'Dragon Bruit', electricpeel:'Electric Peel', guardshroom:'Guard-shroom', aquavine:'Aqua Vine', mangofier:'Mangofier', blastspinner:'Blast Spinner', blazeleaf:'Blaze Leaf', frostbonnet:'Frost Bonnet', znakelily:'Znake Lily', sweetheartsnare:'Sweetheart Snare', hammeruit:'Hammeruit', cornfettipopper:'Corn-fetti Popper', seashooter:'Seashooter', devourbloom:'Devour Bloom', sourshot:'Sour Shot', brainstem:'Brain Stem', blazingknight:'Blazing Knight', sakura:'Sakura', voltsnapdragon:'Volt Snapdragon', thornwhip:'Thorn Whip', scorchoak:'Scorch Oak', cactalog:'Cactalog', baneberry:'Baneberry'
  };
  let originalBytes = null, parsed = null, profile = null, profileEntry = null, profileEntries = [], activeProfileIndex = 0, fieldNodes = {}, powerupNodes = [], plantNodes = [], powerupsArrayNode = null;
  const PLANT_NUMERIC_ID_SEQUENCE = Array.isArray(window.ANTY_PLANT_NUMERIC_ID_SEQUENCE) ? window.ANTY_PLANT_NUMERIC_ID_SEQUENCE : [];
  function normalizePlantKey(value) {
    return String(value ?? '').replace(/^RTID\(/i, '').replace(/\)$/,'').split('@')[0].split('.').pop().toLowerCase().replace(/[^a-z0-9]/g,'');
  }
  function plantNumericId(plantNode, index) {
    if (plantNode && Number.isSafeInteger(plantNode.value) && plantNode.value >= 0) return plantNode.value;
    const key = normalizePlantKey(plantNode?.value);
    if (/^\d+$/.test(key)) return Number(key);
    return Number.isSafeInteger(PLANT_NUMERIC_ID_SEQUENCE[index]) ? PLANT_NUMERIC_ID_SEQUENCE[index] : null;
  }
  function plantRtidDisplay(plantNode) {
    if (!plantNode) return '—';
    const raw = String(plantNode.value ?? '');
    if (/^RTID\(/i.test(raw)) return raw;
    const key = normalizePlantKey(raw);
    return key ? `RTID(${key}@PlantTypes)` : raw || '—';
  }
  function seedTargetFor(plantNode, numericId) {
    if (!Number.isSafeInteger(numericId)) return null;
    const key = normalizePlantKey(plantNode?.value);
    if (key === 'starfruit') return Math.max(0, numericId - 5);
    if (key === 'dazeychain') return Math.max(0, numericId - 10);
    return numericId;
  }

  let originalForm = null, inspectionReport = null;

  function validAmount(input) {
    if (input.value.trim() === '') return false;
    const n = Number(input.value);
    return Number.isSafeInteger(n) && n >= 0 && n <= MAX_AMOUNT;
  }

  function readVarint(bytes, state, end) {
    let value = 0, shift = 0;
    for (let count = 0; count < 10; count++) {
      if (state.p >= end) throw new Error("Unexpected end while reading an RTON number.");
      const b = bytes[state.p++];
      value += (b & 0x7f) * (2 ** shift);
      if (!Number.isSafeInteger(value)) throw new Error("Number exceeds JavaScript's safe integer range.");
      if ((b & 0x80) === 0) return value;
      shift += 7;
    }
    throw new Error("Invalid or oversized RTON number.");
  }

  function encodeVarint(value) {
    const out = [];
    let n = value;
    do {
      let b = n % 128;
      n = Math.floor(n / 128);
      if (n > 0) b |= 0x80;
      out.push(b);
    } while (n > 0);
    return out;
  }

  function parseRTON(bytes) {
    if (bytes.length < 12) throw new Error("File is too small to be an RTON save.");
    if (String.fromCharCode(...bytes.slice(0, 4)) !== "RTON") throw new Error("This file does not begin with the RTON signature.");
    if (bytes[4] !== 1 || bytes[5] !== 0 || bytes[6] !== 0 || bytes[7] !== 0) throw new Error("Unsupported RTON header version.");
    const footerAt = bytes.length - 4;
    if (String.fromCharCode(...bytes.slice(footerAt)) !== "DONE") throw new Error('The expected "DONE" footer is missing.');
    const state = { p: 8, ascii: [], utf8: [] };

    function need(n) {
      if (!Number.isSafeInteger(n) || n < 0 || state.p + n > footerAt) throw new Error("RTON field extends beyond the file boundary.");
    }
    function take(n) {
      need(n);
      const value = bytes.slice(state.p, state.p + n);
      state.p += n;
      return value;
    }
    function string(utf, cache) {
      if (utf) readVarint(bytes, state, footerAt); // UTF-8 character count
      const length = readVarint(bytes, state, footerAt);
      const value = new TextDecoder("utf-8", { fatal: false }).decode(take(length));
      if (cache) (utf ? state.utf8 : state.ascii).push(value);
      return value;
    }
    function chunk(path) {
      need(1);
      const start = state.p;
      const token = bytes[state.p++];
      const node = (value, children = null) => ({ value, start, end: state.p, token, path, children });
      const rawInt = (length, signed) => {
        const part = take(length);
        let value = 0;
        for (let i = 0; i < length; i++) value += part[i] * (256 ** i);
        if (signed && value >= (2 ** (length * 8 - 1))) value -= 2 ** (length * 8);
        return value;
      };
      if (token === 0x00) return node(false);
      if (token === 0x01) return node(true);
      if (token === 0x08) return node(rawInt(1, true));
      if (token === 0x0a) return node(rawInt(1, false));
      if (token === 0x10) return node(rawInt(2, true));
      if (token === 0x12) return node(rawInt(2, false));
      if (token === 0x20) return node(rawInt(4, true));
      if (token === 0x26) return node(rawInt(4, false));
      if (token === 0x22) {
        const part = take(4);
        return node(new DataView(part.buffer, part.byteOffset, 4).getFloat32(0, true));
      }
      if (token === 0x40) return node(rawInt(8, true));
      if (token === 0x46) return node(rawInt(8, false));
      if (token === 0x42) {
        const part = take(8);
        return node(new DataView(part.buffer, part.byteOffset, 8).getFloat64(0, true));
      }
      if ([0x09,0x0b,0x11,0x13,0x21,0x27,0x41,0x47].includes(token)) return node(0);
      if (token === 0x23 || token === 0x43) return node(0.0);
      if ([0x24,0x28,0x44,0x48].includes(token)) return node(readVarint(bytes, state, footerAt));
      if ([0x25,0x29,0x45,0x49].includes(token)) {
        let n = readVarint(bytes, state, footerAt);
        if (n % 2) n = -(n + 1);
        return node(n / 2);
      }
      if (token === 0x81) return node(string(false, false));
      if (token === 0x82) return node(string(true, false));
      if (token === 0x83) {
        need(1);
        const subset = bytes[state.p++];
        if (subset === 0) return node("RTID()");
        if (subset === 2) {
          readVarint(bytes, state, footerAt);
          const len = readVarint(bytes, state, footerAt);
          const name = new TextDecoder().decode(take(len));
          const u2 = readVarint(bytes, state, footerAt);
          const u1 = readVarint(bytes, state, footerAt);
          const id = rawInt(4, false).toString(16);
          return node(`RTID(${u1}.${u2}.${id}@${name})`);
        }
        if (subset === 3) {
          readVarint(bytes, state, footerAt); const n1 = readVarint(bytes, state, footerAt);
          const s1 = new TextDecoder().decode(take(n1));
          readVarint(bytes, state, footerAt); const n2 = readVarint(bytes, state, footerAt);
          const s2 = new TextDecoder().decode(take(n2));
          return node(`RTID(${s2}@${s1})`);
        }
        throw new Error("Unknown RTON reference (RTID) subtype.");
      }
      if (token === 0x84) return node(null);
      if (token === 0x85) return parseObject(path, start, token);
      if (token === 0x86) {
        need(1);
        if (bytes[state.p++] !== 0xfd) throw new Error("Malformed RTON array start.");
        const count = readVarint(bytes, state, footerAt);
        if (count > 2000000) throw new Error("Unreasonable RTON array size.");
        const children = [];
        for (let i = 0; i < count; i++) children.push(chunk(path.concat(i)));
        need(1);
        if (bytes[state.p++] !== 0xfe) throw new Error("Malformed RTON array end.");
        return node(children.map(child => child.value), children);
      }
      if (token === 0x90) return node(string(false, true));
      if (token === 0x91) {
        const index = readVarint(bytes, state, footerAt);
        if (index >= state.ascii.length) throw new Error("Invalid RTON string-cache reference.");
        return node(state.ascii[index]);
      }
      if (token === 0x92) return node(string(true, true));
      if (token === 0x93) {
        const index = readVarint(bytes, state, footerAt);
        if (index >= state.utf8.length) throw new Error("Invalid RTON UTF-8 cache reference.");
        return node(state.utf8[index]);
      }
      if (token === 0xff) return node("__RTON_END__");
      throw new Error(`Unsupported RTON token 0x${token.toString(16).padStart(2, "0")} at byte ${start}.`);
    }
    function parseObject(path, start, token) {
      const value = {};
      const children = [];
      while (state.p < footerAt) {
        const keyNode = chunk(path.concat("<key>"));
        if (keyNode.value === "__RTON_END__") return { value, start, end: state.p, token, path, children };
        if (typeof keyNode.value !== "string") throw new Error("RTON object contains a non-string key.");
        const valueNode = chunk(path.concat(keyNode.value));
        value[keyNode.value] = valueNode.value;
        children.push({ key: keyNode.value, keyNode, valueNode });
      }
      throw new Error("RTON object is missing its end marker.");
    }

    const root = parseObject([], 8, null);
    if (state.p !== footerAt) throw new Error("Unexpected bytes remain before the RTON footer.");
    return { root, bytes, footerAt };
  }

  function child(node, key) {
    return node && node.children && node.children.find(item => item.key === key)?.valueNode;
  }


  function getChild(node, key) {
    return node && node.children && node.children.find(item => item.key === key)?.valueNode;
  }
  function getObjectChildren(node) { return node && Array.isArray(node.children) ? node.children : []; }
  function findProfileEntries(parsedSave) {
    const objects = getChild(parsedSave.root, 'objects');
    if (!objects || !Array.isArray(objects.children)) throw new Error('No objects array was found in this RTON save.');
    return objects.children.filter(entry => getChild(entry, 'objclass')?.value === 'PlayerInfo' && getChild(entry, 'objdata'));
  }
  function findProfile(parsedSave, index = 0) {
    const found = findProfileEntries(parsedSave);
    if (!found.length) throw new Error('No PlayerInfo profile was found in this RTON save.');
    if (!found[index]) throw new Error(`Profile ${index + 1} was not found.`);
    return getChild(found[index], 'objdata');
  }
  function profileName(entry, index) {
    const name = getChild(getChild(entry, 'objdata'), 'n')?.value;
    return typeof name === 'string' && name.trim() ? name : `Profile ${index + 1}`;
  }
  function populateProfileSelect() {
    const select = $('profile-select'); select.replaceChildren();
    profileEntries.forEach((entry, index) => {
      const option = document.createElement('option'); option.value = String(index); option.textContent = `${index + 1}. ${profileName(entry, index)}`; select.append(option);
    });
    select.disabled = profileEntries.length === 0;
    select.value = String(activeProfileIndex);
    $('add-profile-button').disabled = profileEntries.length === 0 || profileEntries.length >= 5;
    $('add-profile-button').title = profileEntries.length >= 5 ? 'The game supports a maximum of 5 profiles.' : '';
    $('rename-profile-name').disabled = profileEntries.length === 0;
    $('rename-profile-button').disabled = profileEntries.length === 0; 
  }
  function loadProfileAt(index) {
    activeProfileIndex = index; profileEntry = profileEntries[index]; profile = getChild(profileEntry, 'objdata');
    if (!profile) throw new Error('Selected profile has no objdata.');
    fieldNodes = {}; powerupNodes = []; plantNodes = []; powerupsArrayNode = null;
    for (const id of Object.keys(resourceFields)) $(id).value = '';
    for (const [id,key] of Object.entries(resourceFields)) { fieldNodes[id] = requireIntField(getChild(profile,key),key); $(id).value = String(fieldNodes[id].value); }
    const plantsNode = getChild(profile,'p'), costumesNode = getChild(profile,'cos');
    $('plant-ids').value = arrayValues(plantsNode,'plants').join(', '); fieldNodes.plants = plantsNode;
    $('costume-ids').value = arrayValues(costumesNode,'costumes').join(', '); fieldNodes.costumes = costumesNode;
    renderPowerups(); renderPlantLevels();
    const bulkPowerupsButton = $('apply-all-powerups'); if (bulkPowerupsButton) bulkPowerupsButton.disabled = false;
    populateProfileSelect(); captureOriginalForm(); validateAll();
  }
  function encodeVarint(value) {
    const out = []; let n = value;
    do { let b = n % 128; n = Math.floor(n / 128); if (n > 0) b |= 0x80; out.push(b); } while (n > 0);
    return out;
  }
  function encodeInt(value) { return new Uint8Array([0x24, ...encodeVarint(value)]); }
  function encodeBool(value) { return new Uint8Array([value ? 0x01 : 0x00]); }
  function encodeIntArray(values) {
    const out = [0x86, 0xfd, ...encodeVarint(values.length)];
    for (const value of values) out.push(...encodeInt(value));
    out.push(0xfe); return new Uint8Array(out);
  }
  function encodeString(value) { const bytes=new TextEncoder().encode(value); return [0x81,...encodeVarint(bytes.length),...bytes]; }
  function encodePowerupArray(items) {
    const out=[0x86,0xfd,...encodeVarint(items.length)];
    for(const item of items) out.push(0x85,...encodeString('n'),...encodeString(item.name),...encodeString('i'),...encodeInt(item.count),0xff);
    out.push(0xfe); return new Uint8Array(out);
  }
  function replaceRanges(bytes, ranges) {
    const sorted = ranges.filter(r => r && r.replacement).slice().sort((a,b) => b.start - a.start);
    for (let i=1; i<sorted.length; i++) if (sorted[i-1].start < sorted[i].end) throw new Error('Overlapping edits detected; export stopped.');
    let result = bytes.slice();
    for (const r of sorted) {
      const next = new Uint8Array(result.length - (r.end-r.start) + r.replacement.length);
      next.set(result.slice(0,r.start),0); next.set(r.replacement,r.start); next.set(result.slice(r.end),r.start+r.replacement.length); result=next;
    }
    return result;
  }
  function requireIntField(node, label) {
    if (!node || !Number.isSafeInteger(node.value) || node.value < 0) throw new Error(`Could not verify numeric field ${label}.`);
    return node;
  }
  function parseIdList(value, label) {
    const parts = value.trim() === '' ? [] : value.split(',').map(s => s.trim());
    const values = parts.map(s => {
      if (!/^\d+$/.test(s)) throw new Error(`${label} must contain only comma-separated whole-number IDs.`);
      const n = Number(s); if (!Number.isSafeInteger(n) || n > MAX_AMOUNT) throw new Error(`${label} contains an ID outside the supported range.`); return n;
    });
    if (new Set(values).size !== values.length) throw new Error(`${label} contains duplicate IDs; remove duplicates before exporting.`);
    return values;
  }
  function arrayValues(node, label) {
    if (!node || !Array.isArray(node.children) || !Array.isArray(node.value)) throw new Error(`Could not verify the ${label} array.`);
    if (!node.children.every(n => Number.isSafeInteger(n.value) && n.value >= 0 && n.value <= MAX_AMOUNT)) throw new Error(`${label} contains entries that are not numeric IDs.`);
    return node.value.slice();
  }
  function addNumberInput(label, value, className='compact-number', maxValue=MAX_AMOUNT) {
    const wrap = document.createElement('div'); wrap.className='field-group '+className;
    const id = 'dyn-'+Math.random().toString(36).slice(2);
    const lab = document.createElement('label'); lab.htmlFor=id; lab.textContent=label;
    const input=document.createElement('input'); input.id=id; input.type='number'; input.min='0'; input.max=String(maxValue); input.step='1'; input.inputMode='numeric'; input.value=String(value);
    wrap.append(lab,input); return {wrap,input};
  }
  function renderPowerups() {
    const host=$('powerups-list'); host.replaceChildren(); powerupNodes=[];
    powerupsArrayNode=getChild(profile,'pr');
    if (!powerupsArrayNode || !Array.isArray(powerupsArrayNode.children)) { host.textContent='No power-up array was found in this save.'; return; }
    const existing=new Map();
    for (const [idx,entry] of powerupsArrayNode.children.entries()) {
      const nameNode=getChild(entry,'n'), countNode=getChild(entry,'i');
      if (nameNode && typeof nameNode.value==='string' && countNode && Number.isSafeInteger(countNode.value) && countNode.value>=0) existing.set(nameNode.value,{node:countNode,index:idx,count:countNode.value});
    }
    const names=[...STANDARD_POWERUPS,...[...existing.keys()].filter(name=>!STANDARD_POWERUPS.includes(name))];
    for (const name of names) {
      const found=existing.get(name); const item=addNumberInput(POWERUP_LABELS[name] || name, found ? found.count : 0);
      item.wrap.classList.add('powerup-item'); host.append(item.wrap);
      powerupNodes.push({node:found?.node || null,input:item.input,name,index:found?.index ?? -1});
    }
    if (!powerupNodes.length) host.textContent='No power-up fields were recognized.';
  }

  function renderPlantLevels() {
    plantNodes = [];
    const host = $('plant-levels-list');
    const count = $('plant-count');
    const seedButton = $('apply-seed-numeric-ids');
    const seedStatus = $('plant-seed-id-status');
    if (!host) return;
    host.replaceChildren();
    const list = getChild(profile, 'plis');
    if (!list || !Array.isArray(list.children)) {
      host.textContent = 'No supported plant-record list was found in this profile. The save can still be inspected and other supported fields edited.';
      if (count) count.textContent = 'No plant records detected.';
      if (seedButton) seedButton.disabled = true;
      if (seedStatus) seedStatus.textContent = 'No plant records found.';
      return;
    }

    for (const [index, entry] of list.children.entries()) {
      const plant = getChild(entry, 'p');
      const level = getChild(entry, 'l');
      const seeds = getChild(entry, 'x');
      const mastery = getChild(entry, 'm');
      if (!plant || !level || !seeds || !mastery ||
          !Number.isSafeInteger(level.value) || !Number.isSafeInteger(seeds.value) ||
          !Number.isSafeInteger(mastery.value) || level.value < 0 || seeds.value < 0 || mastery.value < 0) continue;

      const plantLabel = typeof plant.value === 'string' ? plant.value : String(plant.value);
      const normalizedPlantLabel = normalizePlantKey(plantLabel);
      const plantDisplayName = PLANT_RTID_LABELS[normalizedPlantLabel] || plantLabel;
      const numericId = plantNumericId(plant, index);

      const row = document.createElement('div');
      row.className = 'plant-row';
      row.dataset.plantSearch = `${plantLabel} ${plantDisplayName} ${numericId ?? ''} ${index + 1} ${index}`.toLowerCase();
      row.dataset.level = String(level.value);
      row.dataset.seeds = String(seeds.value);
      row.dataset.mastery = String(mastery.value);
      row.dataset.numericId = numericId == null ? '' : String(numericId);

      const heading = document.createElement('div');
      heading.className = 'plant-row-heading';
      const title = document.createElement('strong');
      title.className = 'plant-id';
      title.textContent = `${plantDisplayName || 'Plant'} · record ${index + 1}`;
      const identifier = document.createElement('span');
      identifier.className = 'plant-id';
      identifier.textContent = `Numeric ID: ${numericId == null ? 'unknown' : numericId}`;
      heading.append(title, identifier);
      row.append(heading);

      const grid = document.createElement('div');
      grid.className = 'field-grid';
      const idInput = addNumberInput('Numeric ID', numericId == null ? '' : numericId, 'plant-numeric-id-field');
      idInput.input.readOnly = numericId != null;
      idInput.input.title = numericId == null
        ? 'Enter the Numeric ID if it is not readable from the save/screenshots.'
        : 'Detected Numeric ID; used for the seed-packet rule.';
      const levelInput = addNumberInput('Plant level', level.value, 'plant-level-field', MAX_PLANT_LEVEL);
      const seedInput = addNumberInput('Seed packets', seeds.value, 'plant-seed-field', MAX_PLANT_SEEDS);
      const masteryInput = addNumberInput('Mastery', mastery.value, 'plant-mastery-field', MAX_PLANT_MASTERY);
      grid.append(idInput.wrap, levelInput.wrap, seedInput.wrap, masteryInput.wrap);
      row.append(grid);

      const rule = document.createElement('small');
      rule.className = 'plant-seed-rule';
      const target = seedTargetFor(plant, numericId);
      rule.textContent = target == null
        ? 'Seed target: enter a Numeric ID first.'
        : `Seed target from screenshot rule: ${target}${normalizedPlantLabel === 'starfruit' ? ' (Starfruit −5)' : normalizedPlantLabel === 'dazeychain' ? ' (Dazey Chain −10)' : ''}`;
      row.append(rule);
      host.append(row);

      for (const input of [idInput.input, levelInput.input, seedInput.input, masteryInput.input]) {
        input.addEventListener('input', () => {
          const currentId = idInput.input.value.trim() === '' ? null : Number(idInput.input.value);
          row.dataset.numericId = Number.isSafeInteger(currentId) ? String(currentId) : '';
          row.dataset.level = levelInput.input.value;
          row.dataset.seeds = seedInput.input.value;
          row.dataset.mastery = masteryInput.input.value;
          const newTarget = seedTargetFor(plant, currentId);
          rule.textContent = newTarget == null
            ? 'Seed target: enter a Numeric ID first.'
            : `Seed target from screenshot rule: ${newTarget}${normalizedPlantLabel === 'starfruit' ? ' (Starfruit −5)' : normalizedPlantLabel === 'dazeychain' ? ' (Dazey Chain −10)' : ''}`;
          filterPlantRows();
        });
      }

      plantNodes.push({
        plant, level, seeds, mastery, index,
        numericIdInput: idInput.input,
        numericId,
        inputs: {
          'Plant level': levelInput.input,
          'Seed packets': seedInput.input,
          'Mastery': masteryInput.input
        }
      });
    }

    if (!plantNodes.length) {
      host.textContent = 'The plant list exists, but no records with the expected numeric level, seed, and mastery fields were recognized. No plant records were changed.';
    }
    if (count) count.textContent = `${plantNodes.length} supported plant record${plantNodes.length === 1 ? '' : 's'} detected.`;
    if (seedButton) seedButton.disabled = plantNodes.length === 0;
    if (seedStatus) seedStatus.textContent = plantNodes.length ? 'Ready: uses the Numeric ID shown on each row.' : 'No plant records found.';
    filterPlantRows();
  }


  function filterPlantRows() {
    const query = ($('plant-search')?.value || '').trim().toLowerCase();
    const filter = $('plant-filter')?.value || 'all';
    const rows = [...$('plant-levels-list').querySelectorAll('.plant-row')];
    let shown = 0;
    rows.forEach(row => {
      const matchesQuery = !query || row.dataset.plantSearch.includes(query);
      const matchesFilter =
        filter === 'all' ||
        (filter === 'leveled' && Number(row.dataset.level) > 0) ||
        (filter === 'seeds' && Number(row.dataset.seeds) > 0) ||
        (filter === 'mastery' && Number(row.dataset.mastery) > 0) ||
        (filter === 'numeric' && row.dataset.numericId !== '');
      row.hidden = !(matchesQuery && matchesFilter);
      if (!row.hidden) shown++;
    });
    const count = $('plant-count');
    if (count && rows.length) count.textContent = `${shown} of ${rows.length} plant records shown.`;
  }

  function captureOriginalForm() {
    originalForm={};
    for (const id of [...Object.keys(resourceFields),'plant-ids','costume-ids']) originalForm[id]=$(id).value;
    originalForm.powerups=powerupNodes.map(p=>p.input.value);
    originalForm.plants=plantNodes.map(p=>({level:p.inputs['Plant level'].value,seeds:p.inputs['Seed packets'].value,mastery:p.inputs['Mastery'].value}));
  }
  function validateAll(showMessage=true) {
    if (!originalBytes || !parsed || !profile) { exportButton.disabled=true; if(showMessage) validation.textContent='Choose a supported save file to begin.'; return false; }
    try {
      for (const id of Object.keys(resourceFields)) { const input=$(id); if(!validAmount(input)) throw new Error(`${input.labels?.[0]?.textContent || id}: enter a whole number from 0 to ${MAX_AMOUNT}.`); }
      parseIdList($('plant-ids').value,'Plant IDs'); parseIdList($('costume-ids').value,'Costume IDs');
      for (const p of powerupNodes) if(!validAmount(p.input)) throw new Error(`Power-up ${p.name}: enter a whole number from 0 to ${MAX_AMOUNT}.`);
      for (const p of plantNodes) {
        const levelInput=p.inputs['Plant level']; const seedInput=p.inputs['Seed packets']; const masteryInput=p.inputs['Mastery'];
        const level=Number(levelInput.value), seeds=Number(seedInput.value), mastery=Number(masteryInput.value);
        if(!Number.isSafeInteger(level) || level < 0 || level > MAX_PLANT_LEVEL) throw new Error(`Plant level: enter a whole number from 0 to ${MAX_PLANT_LEVEL}.`);
        if(!Number.isSafeInteger(seeds) || seeds < 0 || seeds > MAX_PLANT_SEEDS) throw new Error(`Seed packets: enter a whole number from 0 to ${MAX_PLANT_SEEDS.toLocaleString()}.`);
        if(!Number.isSafeInteger(mastery) || mastery < 0 || mastery > MAX_PLANT_MASTERY) throw new Error(`Mastery: enter a whole number from 0 to ${MAX_PLANT_MASTERY}.`);
      }
      exportButton.disabled=false; if(showMessage) validation.textContent='All values are valid. Export will patch only supported fields.'; return true;
    } catch(e) { exportButton.disabled=true; if(showMessage) validation.textContent=e.message; return false; }
  }
  function clearEditor() {
    originalBytes=null; parsed=null; profile=null; profileEntry=null; profileEntries=[]; activeProfileIndex=0; fieldNodes={}; powerupNodes=[]; plantNodes=[]; powerupsArrayNode=null; originalForm=null;
    fileInput.value=''; fileInfo.textContent='No file selected yet.'; status.textContent='Select a supported save to inspect it locally.';
    if ($('resource-amount')) $('resource-amount').value=''; if ($('apply-resources')) { $('apply-resources').disabled=true; $('apply-resources').dataset.applied='false'; } if ($('resource-status')) $('resource-status').textContent='Load a save first.';
    for (const id of Object.keys(resourceFields)) $(id).value=''; $('plant-ids').value=''; $('costume-ids').value='';
    $('powerups-list').textContent='Load a save to show its power-ups.'; $('plant-levels-list').textContent=''; if ($('apply-all-powerups')) $('apply-all-powerups').disabled=true; if ($('all-powerups-amount')) $('all-powerups-amount').value='';     if ($('apply-seed-numeric-ids')) $('apply-seed-numeric-ids').disabled=true; if ($('plant-seed-id-status')) $('plant-seed-id-status').textContent='Load a save first.'; 
    validation.textContent='Choose a save file to begin.'; exportButton.disabled=true; $('profile-select').replaceChildren(new Option('Load a save first','0')); $('profile-select').disabled=true; $('add-profile-button').disabled=true; $('rename-profile-name').disabled=true; $('rename-profile-button').disabled=true; $('rename-profile-name').value='';
    setInspector('Not checked', '—', '—', '—', 'Choose a file to see detected details.', 'Detected profile names will appear here when supported.');
    ['inspector-filename','inspector-hash'].forEach(id => { const node = $(id); if (node) node.textContent = id === 'inspector-hash' ? 'Not calculated' : '—'; });
    const diagnostics = $('inspector-diagnostics'); if (diagnostics) diagnostics.textContent = 'Diagnostics will appear after a file is inspected.';
    const reportButton = $('inspector-report-button'); if (reportButton) reportButton.disabled = true; inspectionReport = null;
  }
  function setInspector(fileStatus, size, format, count, summary, profileText) {
    const values = { 'inspector-status': fileStatus, 'inspector-size': size, 'inspector-format': format, 'inspector-count': count, 'inspector-summary': summary };
    for (const [id, value] of Object.entries(values)) { const node = $(id); if (node) node.textContent = value; }
    const profilesNode = $('inspector-profiles'); if (profilesNode) profilesNode.textContent = profileText;
  }
  function renderDiagnostics(items) {
    const node = $('inspector-diagnostics'); if (!node) return;
    node.replaceChildren();
    items.forEach(item => { const line = document.createElement('div'); line.className = 'inspector-diagnostic'; line.dataset.level = item.level || 'info'; line.textContent = `${item.level === 'good' ? '✓' : item.level === 'warning' ? '⚠' : '•'} ${item.text}`; node.append(line); });
  }
  async function sha256(bytes) {
    if (!globalThis.crypto?.subtle) return 'Unavailable in this browser context';
    const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
  }
  function downloadInspectionReport() {
    if (!inspectionReport) return;
    const blob = new Blob([JSON.stringify(inspectionReport, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob); const link = document.createElement('a');
    link.href = url; link.download = 'antypvz2-save-inspection.json'; document.body.append(link); link.click(); link.remove(); URL.revokeObjectURL(url);
  }
  $('inspector-report-button')?.addEventListener('click', downloadInspectionReport);
  function renderInspectorProfiles(entries) {
    const node = $('inspector-profiles'); if (!node) return;
    node.replaceChildren();
    if (!entries.length) { node.textContent = 'No PlayerInfo profiles were detected.'; return; }
    entries.forEach((entry, index) => {
      const chip = document.createElement('span'); chip.className = 'inspector-profile-chip';
      chip.textContent = `${index + 1}. ${profileName(entry, index)}`; node.append(chip);
    });
  }
  const backupButton = $('create-backup-button');
  const restoreInput = $('restore-backup-file');
  const backupStatus = $('backup-restore-status');
  let selectedOriginalFile = null;
  backupButton.addEventListener('click', () => {
    if (!selectedOriginalFile) return;
    const url = URL.createObjectURL(selectedOriginalFile);
    const link = document.createElement('a');
    link.href = url;
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    link.download = `pp.dat.backup-${stamp}`;
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    backupStatus.textContent = 'Original selected file backup downloaded. Keep it somewhere safe before editing or replacing your game save.';
  });
  restoreInput.addEventListener('change', () => {
    const backup = restoreInput.files && restoreInput.files[0];
    if (!backup) return;
    try {
      const transfer = new DataTransfer();
      transfer.items.add(backup);
      fileInput.files = transfer.files;
      fileInput.dispatchEvent(new Event('change', { bubbles: true }));
      backupStatus.textContent = `Loading backup “${backup.name}” for inspection. This does not overwrite any device file.`;
    } catch (_) {
      backupStatus.textContent = 'This browser cannot load the selected backup automatically. Use Choose save file to select it manually.';
    }
    restoreInput.value = '';
  });

  const resourceAmount = $('resource-amount');
  const applyResourcesButton = $('apply-resources');
  const resourceStatus = $('resource-status');
  if (applyResourcesButton) applyResourcesButton.addEventListener('click', () => {
    const raw = resourceAmount.value.trim();
    const amount = Number(raw);
    if (!raw || !Number.isSafeInteger(amount) || amount < 0 || amount > MAX_AMOUNT) {
      resourceStatus.textContent = `Enter a whole number from 0 to ${MAX_AMOUNT.toLocaleString()}.`;
      return;
    }
    for (const id of Object.keys(resourceFields)) $(id).value = String(amount);
    applyResourcesButton.dataset.applied = 'true';
    resourceStatus.textContent = `Applied ${amount.toLocaleString()} to all six currency/resource fields. You can change it again before exporting.`;
    validateAll();
  });
  if (resourceAmount) resourceAmount.addEventListener('input', () => {
    if (applyResourcesButton) applyResourcesButton.dataset.applied = 'false';
    if (resourceStatus && originalBytes) resourceStatus.textContent = 'Tap “Apply to all” to use this amount for every currency/resource.';
  });

  fileInput.addEventListener('change', async () => {
    const file=fileInput.files && fileInput.files[0]; selectedOriginalFile = file || null; backupButton.disabled = !selectedOriginalFile; clearEditor(); if(!file) return;
    const sizeText = file.size >= 1024 * 1024 ? `${(file.size / (1024 * 1024)).toFixed(2)} MB` : `${(file.size / 1024).toFixed(1)} KB`;
    setInspector('Checking…', sizeText, 'Not verified', '—', 'Reading and validating the file structure locally…', 'Profile detection is in progress.');
    let bytes = null, fingerprint = 'Unavailable in this browser context';
    try {
      if (file.size === 0) throw new Error('The selected file is empty.');
      bytes = new Uint8Array(await file.arrayBuffer());
      try { fingerprint = await sha256(bytes); } catch (_) { fingerprint = 'Could not calculate'; }
      const save=parseRTON(bytes); const entries=findProfileEntries(save);
      if (!entries.length) throw new Error('No PlayerInfo profile was found.');
      originalBytes=bytes; parsed=save; profileEntries=entries; activeProfileIndex=0; loadProfileAt(0);
      if (applyResourcesButton) applyResourcesButton.disabled = false;
      if (resourceStatus) resourceStatus.textContent = 'Save loaded. Enter one amount and tap Apply to all.';
      fileInfo.textContent=`${file.name} · ${sizeText} · RTON v1 · parsed locally, not uploaded.`;
      status.textContent=`Save recognized with ${profileEntries.length} profile(s). Edit locally; exports use the exact filename pp.dat.`;
      setInspector('Parsed successfully', sizeText, 'RTON v1 · header/footer verified', String(entries.length), `The editor parsed this file and found ${entries.length} PlayerInfo profile(s).`, 'Detected profile names:');
      renderInspectorProfiles(entries);
      $('inspector-filename').textContent = file.name;
      $('inspector-hash').textContent = fingerprint;
      const names = entries.map((entry, index) => profileName(entry, index).trim().toLocaleLowerCase());
      const duplicates = names.filter((name, index) => names.indexOf(name) !== index);
      const diagnostics = [
        { level: 'good', text: 'RTON signature, supported header version, and DONE footer were verified.' },
        { level: 'good', text: 'The editor parsed the file and located PlayerInfo profile data.' },
        { level: file.name.toLowerCase().endsWith('.dat') ? 'good' : 'warning', text: file.name.toLowerCase().endsWith('.dat') ? 'Filename has a .dat extension.' : 'Filename does not end in .dat; confirm you selected the intended save.' },
        { level: entries.length > 5 ? 'warning' : 'good', text: `Detected ${entries.length} profile(s); the editor's profile manager supports up to 5.` },
        { level: duplicates.length ? 'warning' : 'good', text: duplicates.length ? 'Some profile names appear duplicated; review the profile list before editing.' : 'No duplicate profile names were detected.' },
        { level: fingerprint.startsWith('Unavailable') || fingerprint === 'Could not calculate' ? 'warning' : 'info', text: fingerprint.startsWith('Unavailable') || fingerprint === 'Could not calculate' ? 'SHA-256 fingerprint could not be calculated in this browser context.' : 'SHA-256 fingerprint calculated for later file comparison.' }
      ];
      renderDiagnostics(diagnostics);
      inspectionReport = { tool: 'AntyPVZ2 Save File Inspector', inspectedAt: new Date().toISOString(), file: { name: file.name, sizeBytes: file.size, sizeDisplay: sizeText, sha256: fingerprint }, result: { status: 'Parsed successfully', format: 'RTON v1', signatureVerified: true, headerVersionSupported: true, doneFooterVerified: true, detectedProfileCount: entries.length, profileNames: entries.map((entry, index) => profileName(entry, index)), duplicateProfileNamesDetected: Boolean(duplicates.length) }, diagnostics: diagnostics.map(item => item.text), disclaimer: 'Best-effort local inspection only. This report does not prove the game will accept the save. File contents were not included in this report.' };
      $('inspector-report-button').disabled = false;
    } catch(e) {
      clearEditor(); fileInfo.textContent=`${file.name} · ${sizeText}`; status.textContent=`Could not load this file: ${e.message}`; validation.textContent='No changes were made. Check that you selected the actual PvZ2 pp.dat save, not a ZIP, screenshot, or backup folder.'; if (resourceStatus) resourceStatus.textContent='The file was selected but could not be parsed. Try the original pp.dat file.';
      setInspector('Could not parse', sizeText, 'Unverified', 'Unavailable', 'The editor could not confirm this is a supported save. No edits were enabled.', 'Profile detection is unavailable because the file could not be parsed.');
      $('inspector-filename').textContent = file.name;
      $('inspector-hash').textContent = fingerprint;
      const diagnostics = [
        { level: 'warning', text: `Parsing failed: ${e.message}` },
        { level: file.size === 0 ? 'warning' : 'info', text: `Selected file size: ${file.size} bytes.` },
        { level: 'info', text: 'Editing is disabled because the file structure could not be verified.' }
      ];
      renderDiagnostics(diagnostics);
      inspectionReport = { tool: 'AntyPVZ2 Save File Inspector', inspectedAt: new Date().toISOString(), file: { name: file.name, sizeBytes: file.size, sizeDisplay: sizeText, sha256: fingerprint }, result: { status: 'Could not parse', format: 'Unverified', detectedProfileCount: null, profileNames: [] }, diagnostics: diagnostics.map(item => item.text), disclaimer: 'Best-effort local inspection only. A parse failure does not by itself prove a file is corrupt. File contents were not included in this report.' };
      $('inspector-report-button').disabled = false;
    }
  });
  $('profile-select').addEventListener('change', () => {
    if (!originalBytes || !profileEntries.length) return;
    const nextIndex = Number($('profile-select').value);
    if (!Number.isInteger(nextIndex) || nextIndex === activeProfileIndex) return;
    try {
      const built = buildEditedSave();
      originalBytes = built.edited; parsed = parseRTON(originalBytes); profileEntries = findProfileEntries(parsed);
      loadProfileAt(nextIndex);
      status.textContent = `Now editing profile ${nextIndex + 1}: ${profileName(profileEntries[nextIndex], nextIndex)}. Changes to the previous profile are kept in memory.`;
    } catch (e) { $('profile-select').value = String(activeProfileIndex); status.textContent = `Could not switch profile: ${e.message}`; }
  });
  document.addEventListener('input', e => { if(e.target.matches('input,textarea')) validateAll(); });
  // One-tap power-up presets apply immediately; currency presets fill the amount field and keep the existing Apply step.
  document.querySelectorAll('.powerup-preset').forEach(button => button.addEventListener('click', () => {
    const input = $('all-powerups-amount');
    if (!input || !profile || !powerupNodes.length) { status.textContent = 'Load a supported save first to apply a power-up preset.'; return; }
    input.value = button.dataset.amount;
    $('apply-all-powerups').click();
  }));

  // Plant presets affect recognized plant records in the active profile only. They never add unrecognized records.
  document.querySelectorAll('.plant-preset').forEach(button => button.addEventListener('click', () => {
    if (!profile || !plantNodes.length) { status.textContent = 'Load a supported save first to apply a plant preset.'; return; }
    const preset = button.dataset.preset;
    for (const p of plantNodes) {
      const levelInput = p.inputs['Plant level'];
      const seedInput = p.inputs['Seed packets'];
      const masteryInput = p.inputs['Mastery'];
      if (preset === 'unlock') {
        levelInput.value = '1';
        if (Number(seedInput.value) < 1) seedInput.value = '1';
      } else if (preset === 'max-level') {
        levelInput.value = String(MAX_PLANT_LEVEL);
      } else if (preset === 'max-mastery') {
        levelInput.value = String(MAX_PLANT_LEVEL);
        masteryInput.value = String(MAX_PLANT_MASTERY);
      } else if (preset === 'level-one') {
        levelInput.value = '1';
        masteryInput.value = '0';
      }
      const row = levelInput.closest('.plant-row');
      if (row) {
        row.dataset.level = levelInput.value;
        row.dataset.seeds = seedInput.value;
        row.dataset.mastery = masteryInput.value;
      }
    }
    validateAll();
    const labels = { unlock: 'All recognized plant records set to level 1 with at least 1 seed packet', 'max-level': `All recognized plant records set to level ${MAX_PLANT_LEVEL}`, 'max-mastery': `All recognized plant records set to level ${MAX_PLANT_LEVEL} and mastery ${MAX_PLANT_MASTERY}`, 'level-one': 'All recognized plant records set to level 1 and mastery 0' };
    status.textContent = `${labels[preset] || 'Plant preset applied'}. Export to save the changes.`;
    filterPlantRows();
  }));

  // Enforce the global numeric ceiling across static and dynamically-created editor fields.
  document.addEventListener('change', e => {
    const input = e.target;
    if (!input.matches('input[type=number]')) return;
    input.min = '0'; input.max = String(MAX_AMOUNT); input.step = '1';
    const raw = input.value.trim();
    if (raw === '') { validateAll(); return; }
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) input.value = '0';
    else if (n > MAX_AMOUNT) input.value = String(MAX_AMOUNT);
    // Keep fractional values visible so validation can explain the error instead of silently rounding.
    validateAll();
  });
  document.addEventListener('blur', e => {
    const input = e.target;
    if (!input.matches('input[type=number]') || input.value.trim() === '') return;
    const n = Number(input.value);
    if (Number.isFinite(n) && Number.isInteger(n)) input.value = String(Math.max(0, Math.min(MAX_AMOUNT, n)));
    validateAll();
  }, true);
  $('apply-all-powerups')?.addEventListener('click', () => {
    if (!profile || !powerupNodes.length) { status.textContent = 'Load a supported save first.'; return; }
    const input = $('all-powerups-amount');
    const value = Number(input.value);
    if (!input.value.trim() || !Number.isSafeInteger(value) || value < 0 || value > MAX_AMOUNT) {
      status.textContent = `Enter a whole number from 0 to ${MAX_AMOUNT} for all power-ups.`; input.focus(); return;
    }
    powerupNodes.forEach(item => { item.input.value = String(value); });
    validateAll();
    status.textContent = `Set all ${powerupNodes.length} power-up fields to ${value}. Export to save the changes.`;
  });
  $('plant-search').addEventListener('input', () => { if(profile) filterPlantRows(); });
  $('plant-filter')?.addEventListener('change', () => { if(profile) filterPlantRows(); });

  $('apply-seed-numeric-ids')?.addEventListener('click', () => {
    if (!profile || !plantNodes.length) {
      status.textContent = 'Load a supported save first.';
      return;
    }
    let applied = 0, skipped = 0;
    for (const p of plantNodes) {
      const rawId = p.numericIdInput?.value?.trim() ?? '';
      const numericId = rawId === '' ? null : Number(rawId);
      if (!Number.isSafeInteger(numericId) || numericId < 0 || numericId > MAX_AMOUNT) {
        skipped++;
        continue;
      }
      const target = seedTargetFor(p.plant, numericId);
      if (target == null) {
        skipped++;
        continue;
      }
      p.inputs['Seed packets'].value = String(target);
      const row = p.inputs['Seed packets'].closest('.plant-row');
      if (row) row.dataset.seeds = String(target);
      applied++;
    }
    validateAll();
    const msg = `Set seed packets for ${applied} plant record${applied === 1 ? '' : 's'} using Numeric ID${skipped ? `; ${skipped} skipped because their Numeric ID is unknown/invalid` : ''}.`;
    $('plant-seed-id-status').textContent = msg;
    status.textContent = msg + ' Export to write the changes into pp.dat.';
  });
  resetButton.addEventListener('click', () => {
    if(!originalForm || !profile) { clearEditor(); return; }
    for(const id of Object.keys(resourceFields)) $(id).value=originalForm[id];
    $('plant-ids').value=originalForm['plant-ids']; $('costume-ids').value=originalForm['costume-ids'];
    powerupNodes.forEach((p,i)=>p.input.value=originalForm.powerups[i]);
    plantNodes.forEach((p,i)=>{const v=originalForm.plants[i];p.inputs['Plant level'].value=v.level;p.inputs['Seed packets'].value=v.seeds;p.inputs['Mastery'].value=v.mastery;const row=p.inputs['Plant level'].closest('.plant-row');if(row){row.dataset.level=v.level;row.dataset.seeds=v.seeds;row.dataset.mastery=v.mastery;}});
    filterPlantRows(); validateAll(); status.textContent='Changes reset to the values from the loaded save.';
  });
  const PLANT_IMAGE_KEY='antyPvz2PlantImagesV1';
  function getPlantImages(){try{return JSON.parse(localStorage.getItem(PLANT_IMAGE_KEY)||'{}')}catch{return {}}}
  function loadPlantImage(id){if(id==null)return null;return getPlantImages()[String(id)]||null}
  function refreshPlantImages(){document.querySelectorAll('.plant-row').forEach(row=>{const id=row.dataset.numericId;const img=row.querySelector('.plant-thumb');const src=loadPlantImage(id);if(img&&src){img.src=src;img.hidden=false}})}
  let cropImage=null;
  $('plant-screenshot-file')?.addEventListener('change', async e=>{const files=[...(e.target.files||[])];if(!files.length)return;const file=files[0];cropImage=new Image();cropImage.onload=()=>{const wb=$('plant-crop-workbench'),img=$('plant-crop-source');img.src=cropImage.src;img.style.width='100%';img.style.maxHeight='65vh';img.style.objectFit='contain';wb.hidden=false;$('plant-image-status').textContent=`Loaded ${file.name}. Tap the center of a card, then enter the numeric ID shown at its bottom. You can switch screenshots using the file picker.`};cropImage.src=URL.createObjectURL(file);});
  $('plant-crop-source')?.addEventListener('click',e=>{if(!cropImage)return;const idText=prompt('Enter the numeric ID displayed at the bottom of this plant card:');if(idText===null)return;const id=Number(idText.trim());if(!Number.isSafeInteger(id)||id<0){alert('Enter a non-negative whole-number ID.');return}const rect=e.currentTarget.getBoundingClientRect();const scaleX=cropImage.naturalWidth/rect.width,scaleY=cropImage.naturalHeight/rect.height;const x=(e.clientX-rect.left)*scaleX,y=(e.clientY-rect.top)*scaleY;const w=Math.min(118,cropImage.naturalWidth),h=Math.min(92,cropImage.naturalHeight);const sx=Math.max(0,Math.min(cropImage.naturalWidth-w,x-w/2)),sy=Math.max(0,Math.min(cropImage.naturalHeight-h,y-h/2));const canvas=document.createElement('canvas');canvas.width=118;canvas.height=92;const ctx=canvas.getContext('2d');ctx.drawImage(cropImage,sx,sy,w,h,0,0,118,92);const data=canvas.toDataURL('image/jpeg',.78);try{const all=getPlantImages();all[String(id)]=data;localStorage.setItem(PLANT_IMAGE_KEY,JSON.stringify(all));refreshPlantImages();$('plant-image-status').textContent=`Saved image crop for numeric ID ${id}. Total saved crops: ${Object.keys(all).length}.`}catch{$('plant-image-status').textContent='Browser storage is full. Export/delete some crops or use a smaller set of screenshots.'}});
  $('download-plant-images')?.addEventListener('click',()=>{const all=getPlantImages();const entries=Object.entries(all);if(!entries.length){$('plant-image-status').textContent='No extracted images yet.';return}const blob=new Blob([JSON.stringify({format:'anty-plant-images-v1',images:all},null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='anty-plant-images.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);$('plant-image-status').textContent=`Exported ${entries.length} extracted image(s) as a JSON bundle.`});
  function buildEditedSave() {
    if(!validateAll()) throw new Error(validation.textContent || 'Please fix invalid values first.');
    const ranges=[];
    for(const id of Object.keys(resourceFields)) { const n=fieldNodes[id], value=Number($(id).value); if(value!==n.value) ranges.push({start:n.start,end:n.end,replacement:encodeInt(value)}); }
    const newPlants=parseIdList($('plant-ids').value,'Plant IDs'); if(JSON.stringify(newPlants)!==JSON.stringify(fieldNodes.plants.value)) ranges.push({start:fieldNodes.plants.start,end:fieldNodes.plants.end,replacement:encodeIntArray(newPlants)});
    const newCostumes=parseIdList($('costume-ids').value,'Costume IDs'); if(JSON.stringify(newCostumes)!==JSON.stringify(fieldNodes.costumes.value)) ranges.push({start:fieldNodes.costumes.start,end:fieldNodes.costumes.end,replacement:encodeIntArray(newCostumes)});
    const powerupsNeedAdd=powerupNodes.some(p=>!p.node && Number(p.input.value)>0);
    if(powerupsNeedAdd) {
      if(powerupsArrayNode.children.length!==0) throw new Error('This save has a non-empty power-up list with an unrecognized missing type. To avoid losing extra data, adding missing power-ups is only enabled when the original list is empty.');
      const entries=powerupNodes.map(p=>({name:p.name,count:Number(p.input.value)})).filter(p=>p.count>0);
      ranges.push({start:powerupsArrayNode.start,end:powerupsArrayNode.end,replacement:encodePowerupArray(entries)});
    } else {
      for(const p of powerupNodes) if(p.node) { const value=Number(p.input.value); if(value!==p.node.value) ranges.push({start:p.node.start,end:p.node.end,replacement:encodeInt(value)}); }
    }
    for(const p of plantNodes) {
      const fields=[[p.level,p.inputs['Plant level']],[p.seeds,p.inputs['Seed packets']],[p.mastery,p.inputs['Mastery']]];
      for(const [node,input] of fields) { const value=Number(input.value); if(value!==node.value) ranges.push({start:node.start,end:node.end,replacement:encodeInt(value)}); }
    }

    const edited=replaceRanges(originalBytes,ranges); const verified=parseRTON(edited); const vp=findProfile(verified, activeProfileIndex);
    for(const [id,key] of Object.entries(resourceFields)) if(getChild(vp,key)?.value!==Number($(id).value)) throw new Error(`Verification failed for ${key}.`);
    if(JSON.stringify(arrayValues(getChild(vp,'p'),'plants'))!==JSON.stringify(newPlants)) throw new Error('Plant list verification failed.');
    if(JSON.stringify(arrayValues(getChild(vp,'cos'),'costumes'))!==JSON.stringify(newCostumes)) throw new Error('Costume list verification failed.');
    const verifiedPowerups=getChild(vp,'pr');
    for(const p of powerupNodes) { const match=verifiedPowerups?.children?.find(entry=>getChild(entry,'n')?.value===p.name); const expected=Number(p.input.value); if((match ? getChild(match,'i')?.value : 0)!==expected) throw new Error(`Power-up verification failed for ${p.name}.`); }
    const verifiedPlis=getChild(vp,'plis');
    for(const p of plantNodes) { const entry=verifiedPlis?.children?.[p.index]; if(getChild(entry,'l')?.value!==Number(p.inputs['Plant level'].value)||getChild(entry,'x')?.value!==Number(p.inputs['Seed packets'].value)||getChild(entry,'m')?.value!==Number(p.inputs['Mastery'].value)) throw new Error(`Plant record verification failed for ID ${p.plant.value}.`); }

    if (edited.length < 12 || String.fromCharCode(...edited.slice(0, 4)) !== 'RTON' || String.fromCharCode(...edited.slice(-4)) !== 'DONE') throw new Error('Export validation failed: the output signature or footer is invalid. No download was created.');
    return {edited, changedRanges:ranges.length};
  }
  function downloadSave(bytes) {
    const blob=new Blob([bytes],{type:'application/octet-stream'}), url=URL.createObjectURL(blob), link=document.createElement('a');
    link.href=url; link.download='pp.dat'; document.body.appendChild(link); link.click(); link.remove(); window.setTimeout(()=>URL.revokeObjectURL(url),1500);
  }
  exportButton.addEventListener('click', () => {
    try {
      const result = buildEditedSave();
      const changeCount = result.changedRanges;
      const prompt = changeCount === 0
        ? 'No supported field changes were detected. Export a copy of this save as pp.dat anyway?'
        : `Safe Export Check\n\n${changeCount} field range(s) will be changed in the exported pp.dat.\n\nThe original imported file will not be overwritten. Keep a backup and only continue if these edits are intended. Game compatibility cannot be guaranteed.\n\nExport now?`;
      if (!window.confirm(prompt)) {
        status.textContent = 'Export cancelled. Your imported save has not been downloaded or overwritten.';
        return;
      }
      downloadSave(result.edited);
      status.textContent = `Export started as pp.dat. Safe Export Check passed: ${changeCount} field range(s) changed and the output passed validation. Keep your original backup; game compatibility cannot be guaranteed.`;
    } catch(e) { status.textContent=`Export stopped: ${e.message}`; }
  });
  $('rename-profile-name').addEventListener('keydown', e => { if (e.key === 'Enter' && !$('rename-profile-button').disabled) $('rename-profile-button').click(); });
  $('profile-name').addEventListener('keydown', e => { if (e.key === 'Enter' && !$('add-profile-button').disabled) $('add-profile-button').click(); });
  $('rename-profile-button').addEventListener('click', () => {
    (() => {
      try {
        if (!originalBytes || !profileEntries.length) throw new Error('Load a supported save first.');
        const name = $('rename-profile-name').value.trim();
        if (!name) throw new Error('Enter a new name for the active profile.');
        if (name.length > 40) throw new Error('Profile names must be 40 characters or fewer.');
        const built = buildEditedSave();
        const base = built.edited;
        const save = parseRTON(base);
        const entries = findProfileEntries(save);
        const entry = entries[activeProfileIndex];
        const nameNode = getChild(getChild(entry, 'objdata'), 'n');
        if (!nameNode || typeof nameNode.value !== 'string') throw new Error('The selected profile name field could not be verified; no download was created.');
        if (nameNode.value === name) throw new Error('That is already the active profile name.');
        const renamed = replaceRanges(base, [{start:nameNode.start, end:nameNode.end, replacement:new Uint8Array(encodeString(name))}]);
        const verified = parseRTON(renamed);
        const verifiedEntries = findProfileEntries(verified);
        if (verifiedEntries.length !== entries.length || profileName(verifiedEntries[activeProfileIndex], activeProfileIndex) !== name) throw new Error('The renamed profile did not pass verification; no download was created.');
        originalBytes = renamed; parsed = verified; profileEntries = verifiedEntries;
        loadProfileAt(activeProfileIndex);
        $('rename-profile-name').value = '';
        downloadSave(renamed);
        status.textContent = `Renamed active profile to “${name}”. The updated save passed parsing and profile-count checks and was downloaded as pp.dat. Keep your original backup; game compatibility cannot be guaranteed.`;
      } catch (e) { status.textContent = `Could not rename profile: ${e.message}`; }
    })();
  });

  $('add-profile-button').addEventListener('click', () => {
    (() => {
    try {
      if (!originalBytes || !profileEntry) throw new Error('Load a save first.');
      if (profileEntries.length >= 5) throw new Error('The game supports a maximum of 5 profiles. This save already has 5 profiles.');
      const name = $('profile-name').value.trim();
      if (!name) throw new Error('Enter a name for the new profile first.');
      if (name.length > 40) throw new Error('Profile names must be 40 characters or fewer.');
      const built = buildEditedSave(); const base = built.edited; const save = parseRTON(base); const entries = findProfileEntries(save);
      const sourceEntry = entries[activeProfileIndex]; if (!sourceEntry) throw new Error('Could not find the selected profile.');
      const sourceData = getChild(sourceEntry, 'objdata'); const nameNode = getChild(sourceData, 'n');
      const idNode = getChild(sourceData, 'i'), rsNode = getChild(sourceData, 'rs');
      if (!nameNode || typeof nameNode.value !== 'string' || !idNode || !Number.isSafeInteger(idNode.value) || !rsNode || !Number.isSafeInteger(rsNode.value)) throw new Error('This profile does not have the expected name and ID fields; profile creation was stopped safely.');
      const idValues = entries.flatMap(entry => { const data=getChild(entry,'objdata'); return [getChild(data,'i')?.value,getChild(data,'rs')?.value].filter(Number.isSafeInteger); });
      const newId = Math.max(Math.floor(Date.now()/1000), ...idValues) + 1;
      if (!Number.isSafeInteger(newId) || newId < 0) throw new Error('A safe unique profile ID could not be generated; no changes were exported.');
      let clone = base.slice(sourceEntry.start, sourceEntry.end);
      clone = replaceRanges(clone, [
        {start:nameNode.start-sourceEntry.start,end:nameNode.end-sourceEntry.start,replacement:new Uint8Array(encodeString(name))},
        {start:idNode.start-sourceEntry.start,end:idNode.end-sourceEntry.start,replacement:encodeInt(newId)},
        {start:rsNode.start-sourceEntry.start,end:rsNode.end-sourceEntry.start,replacement:encodeInt(newId)}
      ]);
      const objectsNode = getChild(save.root, 'objects'); if (!objectsNode || !Array.isArray(objectsNode.children)) throw new Error('The objects array could not be safely updated.');
      const arrayBytes = [0x86,0xfd,...encodeVarint(objectsNode.children.length+1)];
      for (const entry of objectsNode.children) {
        const entryBytes = base.subarray(entry.start, entry.end);
        for (let i = 0; i < entryBytes.length; i++) arrayBytes.push(entryBytes[i]);
      }
      for (let i = 0; i < clone.length; i++) arrayBytes.push(clone[i]);
      arrayBytes.push(0xfe);
      const combined = replaceRanges(base,[{start:objectsNode.start,end:objectsNode.end,replacement:new Uint8Array(arrayBytes)}]);
      const verified = parseRTON(combined), verifiedEntries = findProfileEntries(verified);
      if (verifiedEntries.length !== entries.length+1 || profileName(verifiedEntries[verifiedEntries.length-1],verifiedEntries.length-1) !== name) throw new Error('The new profile did not pass verification; no download was created.');
      originalBytes=combined; parsed=verified; profileEntries=verifiedEntries; activeProfileIndex=verifiedEntries.length-1;
      loadProfileAt(activeProfileIndex); $('profile-name').value='';
      status.textContent=`Added profile “${name}” by copying the selected profile. The change is kept in the editor; use Export as pp.dat when you are ready to save it.`;
    } catch(e) { status.textContent=`Could not add profile: ${e.message}`; }
    })();
  });
  clearEditor();
})();
