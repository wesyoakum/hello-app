// Configuration management
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

function loadConfig(name) {
  const configs = getConfigs();
  if (configs[name]) {
    fillInputs(configs[name]);
    document.getElementById('output').textContent = JSON.stringify(configs[name], null, 2);
    const results = calculateDrumLayers(configs[name]);
    document.getElementById('layers').textContent = JSON.stringify(results, null, 2);
  }
}

function saveCurrentConfig() {
  const name = document.getElementById('configSelect').value;
  const configs = getConfigs();
  configs[name] = readInputs();
  saveConfigs(configs);
  document.getElementById('output').textContent = JSON.stringify(configs[name], null, 2);
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
    document.getElementById('output').textContent = '';
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
  const inputs = readInputs();
  for (const key in inputs) {
    if (key === 'winch_type' || key === 'winch_model') {
      if (!inputs[key]) {
        alert(`Missing value: ${key}`);
        return;
      }
      continue;
    }
        if (inputs[key] === null || isNaN(inputs[key])) {
      alert(`Missing or invalid value: ${key}`);
      return;
    }
  }
  const layerResults = calculateDrumLayers(inputs);
  document.getElementById('layers').textContent = JSON.stringify(layerResults, null, 2);
});

// Configuration button handlers
window.addEventListener('DOMContentLoaded', () => {
  populateConfigSelect();
  const select = document.getElementById('configSelect');
  if (select.value) loadConfig(select.value);

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
  select.addEventListener('change', () => loadConfig(select.value));
});

function calculateDrumLayers(inputs) {
  const u = math.unit;
  try {
    const drumCoreDia = u(inputs.sel_drum_core_dia, 'inch');
    const lebusThickness = u(inputs.sel_drum_lebus_thickness, 'inch');
    const cableDia = u(inputs.sel_umb_dia, 'mm').to('inch');
    const flangeToFlange = u(inputs.sel_drum_flange_to_flange, 'inch');
    const flangeDia = u(inputs.sel_drum_flange_dia, 'inch');
    const cableLength = u(inputs.sel_cable_length, 'm');
    const wrapsPerLayerInput = inputs.sel_drum_wraps_per_layer;
    const payloadWeight = u(inputs.sel_payload_weight, 'kgf');
    const cableWeight = u(inputs.sel_umb_weight, 'lbf/ft');

    const reqFreeFlange = cableDia.multiply(2.5);
    const actualFreeFlange = flangeDia.divide(u(2, '')).subtract(
      drumCoreDia.divide(u(2, '')).add(lebusThickness)
    );

    const usableWidth = flangeToFlange;
    const wrapsPerLayer = wrapsPerLayerInput > 0
      ? wrapsPerLayerInput
      : Math.floor(usableWidth.toNumber('inch') / cableDia.toNumber('inch'));

    const layers = [];
    let remainingCable = cableLength;
    let accLength = u(0, 'm');
    let layer = 0;
    let currentRadius = drumCoreDia.divide(2);
    const cableDiaInch = cableDia.to('inch');

    while (remainingCable.toNumber('m') > 0 && currentRadius.multiply(2).lt(flangeDia)) {
      const layerRadius = currentRadius.add(cableDiaInch.multiply(0.5));
      const circumference = layerRadius.multiply(2 * Math.PI);
      const cablePerWrap = circumference.to('m');
      const layerLength = cablePerWrap.multiply(wrapsPerLayer);
      const layerLengthLimited = math.min(layerLength, remainingCable);
      accLength = accLength.add(layerLengthLimited);
      remainingCable = remainingCable.subtract(layerLengthLimited);

      const tension = payloadWeight.add(
        accLength.multiply(cableWeight.to('kgf/m'))
      ).to('kgf');

      layers.push({
        layer: layer + 1,
        dia_inch: layerRadius.multiply(2).to('inch').toNumber(),
        cable_on_drum_m: accLength.toNumber('m'),
        cable_in_water_m: accLength.toNumber('m'),
        operating_tension_kgf: tension.toNumber('kgf')
      });

      currentRadius = layerRadius;
      layer++;
    }

    return {
      wrapsPerLayer,
      reqFreeFlange: reqFreeFlange.to('inch').toString(),
      actualFreeFlange: actualFreeFlange.to('inch').toString(),
      layers
    };

  } catch (err) {
    return {
      error: err.message,
      layers: []
    };
  }
}