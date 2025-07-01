// Configuration management 2507010903
const CONFIG_KEY = 'winch_configs';

function getConfigs() {
  try {
    return JSON.parse(localStorage.getItem(CONFIG_KEY)) || {};
  } catch (e) {
    return {};
  }
}

function saveConfigs(configs) {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(configs));
}

function updateFieldVisibility() {
  const type = document.getElementById('winch_type').value;
  document.querySelectorAll('.electric-only').forEach(el => {
    el.style.display = type === 'electric' ? 'block' : 'none';
  });
  document.querySelectorAll('.hydraulic-only').forEach(el => {
    el.style.display = type === 'hydraulic' ? 'block' : 'none';
  });
}

function readInputs() {
  return {
    winch_type: document.getElementById('winch_type').value,
    winch_model: document.getElementById('winch_model').value,
    req_swl: parseFloat(document.getElementById('req_swl').value),
    req_speed: parseFloat(document.getElementById('req_speed').value),
    sel_umb_dia: parseFloat(document.getElementById('sel_umb_dia').value),
    sel_cable_length: parseFloat(document.getElementById('sel_cable_length').value),
    sel_umb_weight: parseFloat(document.getElementById('sel_umb_weight').value),
    sel_drum_core_dia: parseFloat(document.getElementById('sel_drum_core_dia').value),
    sel_drum_lebus_thickness: parseFloat(document.getElementById('sel_drum_lebus_thickness').value),
    sel_drum_flange_dia: parseFloat(document.getElementById('sel_drum_flange_dia').value),
    sel_drum_flange_to_flange: parseFloat(document.getElementById('sel_drum_flange_to_flange').value),
    sel_drum_wraps_per_layer: parseFloat(document.getElementById('sel_drum_wraps_per_layer').value),
    sel_payload_weight: parseFloat(document.getElementById('sel_payload_weight').value),
    sel_elec_motor_power: parseFloat(document.getElementById('sel_elec_motor_power').value),
    sel_hyd_system_psi_max: parseFloat(document.getElementById('sel_hyd_system_psi_max').value),
    sel_hyd_mech_efficiency: parseFloat(document.getElementById('sel_hyd_mech_efficiency').value),
    sel_pinion_ratio: parseFloat(document.getElementById('sel_pinion_ratio').value),
    sel_gearbox_ratio: parseFloat(document.getElementById('sel_gearbox_ratio').value),
    sel_motor_count: parseFloat(document.getElementById('sel_motor_count').value),
    sel_motor_power: parseFloat(document.getElementById('sel_motor_power').value),
    sel_motor_torque: parseFloat(document.getElementById('sel_motor_torque').value),
    sel_motor_rpm: parseFloat(document.getElementById('sel_motor_rpm').value),
    sel_motor_eff: parseFloat(document.getElementById('sel_motor_eff').value),
    sel_hyd_motor_displacement: parseFloat(document.getElementById('sel_hyd_motor_displacement').value),
    sel_hyd_motor_max_rpm: parseFloat(document.getElementById('sel_hyd_motor_max_rpm').value),
    sel_elec_motor_rpm: parseFloat(document.getElementById('sel_elec_motor_rpm').value),
    sel_hyd_num_pumps: parseFloat(document.getElementById('sel_hyd_num_pumps').value),
    sel_hyd_pump_displacement: parseFloat(document.getElementById('sel_hyd_pump_displacement').value),
    sel_hyd_charge_pressure: parseFloat(document.getElementById('sel_hyd_charge_pressure').value)
  };
}

function fillInputs(data) {
  for (const key in data) {
    const field = document.getElementById(key);
    if (field && data[key] !== undefined) {
      field.value = data[key];
    }
  }
}

function clearInputs() {
  document.querySelectorAll('#inputForm input, #inputForm select').forEach(el => {
    el.value = '';
  });
}

function populateConfigSelect() {
  const select = document.getElementById('configSelect');
  const configs = getConfigs();
  select.innerHTML = '';
  Object.keys(configs).forEach(name => {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    select.appendChild(opt);
  });
  if (select.options.length === 0) {
    const def = 'Default';
    configs[def] = {};
    saveConfigs(configs);
    const opt = document.createElement('option');
    opt.value = def;
    opt.textContent = def;
    select.appendChild(opt);
  }
}

function tryCalculateAndDisplay() {
  const inputs = readInputs();
  const valid = Object.keys(inputs).every(key => {
    if (key === 'winch_type' || key === 'winch_model') return true;
    return inputs[key] !== null && !isNaN(inputs[key]);
  });
  if (valid) {
    const results = calculateDrumLayers(inputs);
    document.getElementById('layers').textContent = JSON.stringify(results, null, 2);
  } else {
    document.getElementById('layers').textContent = '';
  }
}

function loadConfig(name) {
  clearInputs();
  const configs = getConfigs();
  if (configs[name]) {
    fillInputs(configs[name]);
        updateFieldVisibility();
    console.log('loadConfig', name, configs[name]);
    tryCalculateAndDisplay();
  }
}

function saveCurrentConfig() {
  const name = document.getElementById('configSelect').value;
  const configs = getConfigs();
  configs[name] = readInputs();
  saveConfigs(configs);
}

function addNewConfig() {
  const name = prompt('New configuration name:');
  if (!name) return;
  const configs = getConfigs();
  if (configs[name]) {
    alert('Configuration already exists');
    return;
  }
  configs[name] = readInputs();
  saveConfigs(configs);
  populateConfigSelect();
  document.getElementById('configSelect').value = name;
}

function deleteConfig() {
  const select = document.getElementById('configSelect');
  const name = select.value;
  if (!confirm(`Delete configuration "${name}"?`)) return;
  const configs = getConfigs();
  delete configs[name];
  saveConfigs(configs);
  populateConfigSelect();
  if (select.options.length) {
    select.value = select.options[0].value;
    loadConfig(select.value);
  } else {
    document.getElementById('layers').textContent = '';
  }
}

function renameConfig() {
  const select = document.getElementById('configSelect');
  const oldName = select.value;
  const newName = prompt('New name:', oldName);
  if (!newName || newName === oldName) return;
  const configs = getConfigs();
  if (configs[newName]) {
    alert('A configuration with that name already exists');
    return;
  }
  configs[newName] = configs[oldName];
  delete configs[oldName];
  saveConfigs(configs);
  populateConfigSelect();
  select.value = newName;
}

function exportConfigs() {
  const data = JSON.stringify(getConfigs());
  const blob = new Blob([data], {type: 'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'configs.json';
  a.click();
  URL.revokeObjectURL(url);
}

function importConfigs(file) {
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const obj = JSON.parse(e.target.result);
      const configs = getConfigs();
      Object.assign(configs, obj);
      saveConfigs(configs);
      populateConfigSelect();
    } catch (err) {
      alert('Invalid configuration file');
    }
  };
  reader.readAsText(file);
}

// Form submission
document.getElementById('inputForm').addEventListener('submit', function (event) {
  event.preventDefault();
  updateFieldVisibility();
  tryCalculateAndDisplay();
});

// Configuration button handlers
window.addEventListener('DOMContentLoaded', () => {
  populateConfigSelect();
   const select = document.getElementById('configSelect');
  if (select.value) loadConfig(select.value);
  updateFieldVisibility();

  document.getElementById('winch_type').addEventListener('change', updateFieldVisibility);
  document.getElementById('configAdd').addEventListener('click', addNewConfig);
  document.getElementById('configSave').addEventListener('click', () => {
    saveCurrentConfig();
  });
  document.getElementById('configDelete').addEventListener('click', deleteConfig);
  document.getElementById('configRename').addEventListener('click', renameConfig);
  document.getElementById('configExport').addEventListener('click', exportConfigs);
  document.getElementById('configImport').addEventListener('click', () => {
    document.getElementById('configImportInput').click();
  });
  document.getElementById('configImportInput').addEventListener('change', e => {
    if (e.target.files[0]) {
      importConfigs(e.target.files[0]);
    }
    e.target.value = '';
  });
  document.querySelectorAll('#inputForm input, #inputForm select').forEach(el => {
    el.addEventListener('input', () => {
      updateFieldVisibility();
      tryCalculateAndDisplay();
    });
  });
  select.addEventListener('change', () => loadConfig(select.value));
});

function calculateDrumLayers(inputs) {
  const PACKING_FACTOR = 0.866; // radial increment multiplier for cross-lay spooling

  console.log('calculateDrumLayers inputs', inputs);
  try {
    if (typeof math === 'undefined' || !math.unit) {
      throw new Error('math.js library is required for calculateDrumLayers');
    }
    const u = math.unit;
    const cableDia = u(inputs.sel_umb_dia, 'mm').to('inch');
    const flangeToFlange = u(inputs.sel_drum_flange_to_flange, 'inch');
    const flangeDia = u(inputs.sel_drum_flange_dia, 'inch');
    const coreDia = u(inputs.sel_drum_core_dia, 'inch');
    const lebusThickness = u(inputs.sel_drum_lebus_thickness, 'inch');
    const cableLength = u(inputs.sel_cable_length, 'm');

    const reqFreeFlange = cableDia.multiply(2.5);
    const flangeRadius = flangeDia.divide(2);
    const bareDrumRadius = math.add(
      math.divide(math.add(coreDia, cableDia), 2),
      lebusThickness
    );
    const bareDrumDia = bareDrumRadius.multiply(2);
    const actualFreeFlangeBare = math.subtract(flangeRadius, bareDrumRadius);

    let baseWraps = inputs.sel_drum_wraps_per_layer > 0
      ? inputs.sel_drum_wraps_per_layer
      : Math.floor(
          math.divide(
            math.divide(flangeToFlange.multiply(2), cableDia),
            2
          ).toNumber()
        );
    if (baseWraps < 1) baseWraps = 1;

    const wrapPattern = [baseWraps, Math.max(baseWraps - 1, 1)];
    const radInc = cableDia.multiply(PACKING_FACTOR);
    const layers = [];
    let currentRadius = bareDrumRadius;
    let remaining = cableLength;
    let cumulative = u(0, 'm');
    let idx = 0;

    while (remaining.toNumber('m') > 0 && math.smaller(math.add(currentRadius, radInc), flangeRadius)) {
      const wraps = wrapPattern[idx % wrapPattern.length];
      const nextRadius = math.add(currentRadius, radInc);
      const freeFlange = math.subtract(flangeRadius, nextRadius); // compute free flange immediately

      // stop if this layer would violate the required free flange
      if (math.smaller(freeFlange, reqFreeFlange)) {
        break;
      }

      const circumference = nextRadius.multiply(2 * Math.PI);
      let capacity = circumference.to('m').multiply(wraps);
      if (math.larger(capacity, remaining)) {
        capacity = remaining;
      }
      cumulative = math.add(cumulative, capacity);
      remaining = math.subtract(remaining, capacity);

      layers.push({
        layer: idx + 1,
        wrapsAvailable: wraps,
        diameter_in: nextRadius.multiply(2).to('inch').toNumber(),
        layer_capacity_m: capacity.toNumber('m'),
        cumulative_capacity_m: cumulative.toNumber('m'),
        free_flange_in: freeFlange.to('inch').toNumber()
      });

      currentRadius = nextRadius; // update radius only after accepting the layer
      idx++;

      if (math.smaller(freeFlange, reqFreeFlange)) {
        break;
      }
    }

    const fullDrumDia = currentRadius.multiply(2);

    const result = {
      numLayers: layers.length,
      bareDrumDiameter_in: bareDrumDia.to('inch').toNumber(),
      fullDrumDiameter_in: fullDrumDia.to('inch').toNumber(),
      reqFreeFlange_in: reqFreeFlange.to('inch').toNumber(),
      actualFreeFlangeBare_in: actualFreeFlangeBare.to('inch').toNumber(),
      layers
    };
    console.log('calculateDrumLayers result', result)
    return result;
    
  } 
  catch (err) {
    console.error('calculateDrumLayers error', err);
    return {
      error: err.message,
      layers: []
    };
  } 
}
