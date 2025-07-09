// Configuration management
const CONFIG_KEY = 'winch_configs';

// Default configurations bundled with the app
const DEFAULT_CONFIGS = {
  "Default": {},
  "CTW513": {
    winch_type: "hydraulic",
    winch_model: "CTW513",
    req_swl: 13000,
    req_speed: 90,
        wave_height: 2,
    wave_period: 10,
    avg_offset_speed: 0,
    sel_umb_dia: 41,
    sel_cable_length: 3500,
    sel_umb_weight: 1.2,
    sel_drum_core_dia: 70,
    sel_drum_lebus_thickness: 0.625,
    sel_drum_flange_dia: 110,
    sel_drum_flange_to_flange: 91.5,
    sel_drum_wraps_per_layer: 56,
    sel_payload_weight: 1537,
    sel_elec_motor_power: 150,
    sel_hyd_system_psi_max: 4000,
    sel_hyd_mech_efficiency: 0.85,
    sel_pinion_ratio: 5.24,
    sel_gearbox_ratio: 20,
    sel_motor_count: 6,
    sel_motor_power: 44000,
    sel_motor_torque: 192,
    sel_motor_rpm: 1780,
    sel_motor_eff: 0.96,
    sel_hyd_motor_displacement: 105,
    sel_hyd_motor_max_rpm: 3700,
    sel_elec_motor_rpm: 1780,
    sel_hyd_num_pumps: 2,
    sel_hyd_pump_displacement: 210,
    sel_hyd_charge_pressure: 300
  }
};


let tensionChart = null;
let speedChart = null;
let drumCtx = null;

function getConfigs() {
  try {
    const stored = JSON.parse(localStorage.getItem(CONFIG_KEY)) || {};
    const merged = { ...DEFAULT_CONFIGS, ...stored };
    const missing = Object.keys(DEFAULT_CONFIGS).filter(k => !(k in stored));
    if (missing.length > 0) {
      localStorage.setItem(CONFIG_KEY, JSON.stringify(merged));
    }
    return merged;
  } catch (e) {
    return { ...DEFAULT_CONFIGS };
  }
}

function calculateWinchPerformance(inputs, layers) {
  try {
    if (typeof math === 'undefined' || !math.unit) {
      throw new Error('math.js library is required for calculateWinchPerformance');
    }
    const u = math.unit;

    const toMeters = x => u(x, 'inch').toNumber('m');
    const totalGearRatio = (inputs.sel_pinion_ratio || 1) * (inputs.sel_gearbox_ratio || 1);

    const cableWeight = inputs.sel_umb_weight; // kgf per m
    const payload = inputs.sel_payload_weight; // kgf
    const cableLength = inputs.sel_cable_length || 0; // total length of cable

    const g = 9.80665; // N per kgf

    const perf = [];

    if (inputs.winch_type === 'electric') {
      const torque = inputs.sel_motor_torque * inputs.sel_motor_count * totalGearRatio; // N*m
      const power = inputs.sel_motor_power * inputs.sel_motor_count * (inputs.sel_motor_eff || 1); // W
      const rpm = inputs.sel_motor_rpm; // 1/min

      layers.forEach(l => {
        const radius = toMeters(l.diameter_in) / 2;
        const diameter = toMeters(l.diameter_in);
        const depth = (typeof l.depth_m === 'number')
          ? l.depth_m
          : cableLength - l.cumulative_capacity_m;
        const tensionN = (payload + cableWeight * depth) * g;

        const availTen = torque / radius / g; // kgf
        const rpmSpeed = rpm * diameter * Math.PI / totalGearRatio; // m/min
        const powerSpeed = (power / tensionN) * 60; // m/min
        const actual = Math.min(rpmSpeed, powerSpeed);

        perf.push({
          layer: l.layer,
          available_tension_kgf: availTen,
          rpm_speed_mpm: rpmSpeed,
          power_speed_mpm: powerSpeed,
          actual_speed_mpm: actual
        });
      });
    } else if (inputs.winch_type === 'hydraulic') {
      const disp = inputs.sel_hyd_motor_displacement; // cc
      const maxRpm = inputs.sel_hyd_motor_max_rpm; // not used
      const elecRpm = inputs.sel_elec_motor_rpm; // pump rpm
      const elecPwr = inputs.sel_elec_motor_power; // hp
      const pumps = inputs.sel_hyd_num_pumps;
      const mechEff = inputs.sel_hyd_mech_efficiency || 1;
      const sysPsi = inputs.sel_hyd_system_psi_max; // psi
      const charge = inputs.sel_hyd_charge_pressure; // psi
      const pumpDisp = inputs.sel_hyd_pump_displacement; // cc

      const psiToPa = 6894.75729;
      const effPress = (sysPsi - charge) * psiToPa; // Pa
      const availTrq = disp / 1e6 * effPress * mechEff / (2 * Math.PI); // N*m
      const totalTrq = availTrq * inputs.sel_motor_count * totalGearRatio;
      const qAvail = pumpDisp / 1e6 * elecRpm * pumps; // m^3 per min assuming cc -> m^3

      layers.forEach(l => {
        const radius = toMeters(l.diameter_in) / 2;
        const diameter = toMeters(l.diameter_in);
        const depth = (typeof l.depth_m === 'number')
          ? l.depth_m
          : cableLength - l.cumulative_capacity_m;
        const tensionN = (payload + cableWeight * depth) * g;

        const availTen = totalTrq / radius / g; // kgf

        const qLtdRpm = qAvail / (inputs.sel_motor_count * (disp / 1e6)) ; // 1/min
        const speedHp = (mechEff * elecPwr * pumps * 745.7 / tensionN) * 60; // m/min (hp to W, then m/s to m/min)
        const drumRpm = qLtdRpm / totalGearRatio;
        const speedQ = Math.PI * diameter * drumRpm; // m/min

        const actual = Math.min(speedQ, speedHp);

        perf.push({
          layer: l.layer,
          available_tension_kgf: availTen,
          rpm_speed_mpm: speedQ,
          power_speed_mpm: speedHp,
          actual_speed_mpm: actual
        });
      });
    }

    return perf;

  } catch (err) {
    console.error('calculateWinchPerformance error', err);
    return [];
  }
}

function combineResults(inputs, layers, perf) {
  try {
    if (typeof math === 'undefined' || !math.unit) {
      throw new Error('math.js library is required for combineResults');
    }
    const u = math.unit;

    const totalGearRatio = (inputs.sel_pinion_ratio || 1) * (inputs.sel_gearbox_ratio || 1);
    const cableLength = inputs.sel_cable_length || 0;
    const cableWeight = inputs.sel_umb_weight || 0;
    const payload = inputs.sel_payload_weight || 0;
    const disp = inputs.sel_hyd_motor_displacement;
    const mechEff = inputs.sel_hyd_mech_efficiency || 1;
    const charge = inputs.sel_hyd_charge_pressure || 0;
    const psiToPa = 6894.75729;
    const g = 9.80665;

    return layers.map((l, idx) => {
      const p = perf[idx] || {};
      const depth = typeof l.depth_m === 'number'
        ? l.depth_m
        : cableLength - l.cumulative_capacity_m;
      const tension = depth * cableWeight + payload;

      let reqPress = null;
      if (inputs.winch_type === 'hydraulic' && disp) {
        const radius = u(l.diameter_in, 'inch').toNumber('m') / 2;
        const tensionN = tension * g;
        const drumTorque = tensionN * radius;
        const motorTorque = drumTorque / (totalGearRatio * (inputs.sel_motor_count || 1));
        const pressPa = motorTorque * 2 * Math.PI / (disp / 1e6 * mechEff);
        reqPress = pressPa / psiToPa + charge;
      }

      return {
        layer: l.layer,
        diameter_in: l.diameter_in,
        layer_capacity_m: l.layer_capacity_m,
        cumulative_capacity_m: l.cumulative_capacity_m,
        depth_m: depth,
        tension_kgf: tension,
        available_tension_kgf: p.available_tension_kgf,
        actual_speed_mpm: p.actual_speed_mpm,
        rpm_speed_mpm: p.rpm_speed_mpm,
        power_speed_mpm: p.power_speed_mpm,
        required_pressure_psi: reqPress
      };
    });
  } catch (err) {
    console.error('combineResults error', err);
    return [];
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

function getStringValue(id) {
  const el = document.getElementById(id);
  return el ? el.value : '';
}

function getNumericValue(id) {
  const el = document.getElementById(id);
  if (!el) return null;
  const num = parseFloat(el.value);
  return isNaN(num) ? null : num;
}
function readInputs() {
  return {
    winch_type: getStringValue('winch_type'),
    winch_model: getStringValue('winch_model'),
    req_swl: getNumericValue('req_swl'),
    req_speed: getNumericValue('req_speed'),
      wave_height: getNumericValue('wave_height'),
    wave_period: getNumericValue('wave_period'),
    avg_offset_speed: getNumericValue('avg_offset_speed'),
    sel_umb_dia: getNumericValue('sel_umb_dia'),
    sel_cable_length: getNumericValue('sel_cable_length'),
    sel_umb_weight: getNumericValue('sel_umb_weight'),
    sel_drum_core_dia: getNumericValue('sel_drum_core_dia'),
    sel_drum_lebus_thickness: getNumericValue('sel_drum_lebus_thickness'),
    sel_drum_flange_dia: getNumericValue('sel_drum_flange_dia'),
    sel_drum_flange_to_flange: getNumericValue('sel_drum_flange_to_flange'),
    sel_drum_wraps_per_layer: getNumericValue('sel_drum_wraps_per_layer'),
    sel_payload_weight: getNumericValue('sel_payload_weight'),
    sel_elec_motor_power: getNumericValue('sel_elec_motor_power'),
    sel_hyd_system_psi_max: getNumericValue('sel_hyd_system_psi_max'),
    sel_hyd_mech_efficiency: getNumericValue('sel_hyd_mech_efficiency'),
    sel_pinion_ratio: getNumericValue('sel_pinion_ratio'),
    sel_gearbox_ratio: getNumericValue('sel_gearbox_ratio'),
    sel_motor_count: getNumericValue('sel_motor_count'),
    sel_motor_power: getNumericValue('sel_motor_power'),
    sel_motor_torque: getNumericValue('sel_motor_torque'),
    sel_motor_rpm: getNumericValue('sel_motor_rpm'),
    sel_motor_eff: getNumericValue('sel_motor_eff'),
    sel_hyd_motor_displacement: getNumericValue('sel_hyd_motor_displacement'),
    sel_hyd_motor_max_rpm: getNumericValue('sel_hyd_motor_max_rpm'),
    sel_elec_motor_rpm: getNumericValue('sel_elec_motor_rpm'),
    sel_hyd_num_pumps: getNumericValue('sel_hyd_num_pumps'),
    sel_hyd_pump_displacement: getNumericValue('sel_hyd_pump_displacement'),
    sel_hyd_charge_pressure: getNumericValue('sel_hyd_charge_pressure')
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

function clearResults() {
  document.getElementById('summary').textContent = '';
  const body = document.querySelector('#resultsTable tbody');
  if (body) body.innerHTML = '';
  if (tensionChart) {
    tensionChart.destroy();
    tensionChart = null;
  }
  if (speedChart) {
    speedChart.destroy();
    speedChart = null;
  }
    const canvas = document.getElementById('drumCanvas');
  if (canvas && drumCtx) {
    drumCtx.clearRect(0, 0, canvas.width, canvas.height);
  }
  const note = document.getElementById('wraps_note');
  if (note) note.textContent = '';
  const reqDiv = document.getElementById('required_speed');
  if (reqDiv) reqDiv.textContent = '';  if (note) note.textContent = '';
  const plot1 = document.getElementById('ahcPlot1');
  const plot2 = document.getElementById('ahcPlot2');
  if (typeof Plotly !== 'undefined') {
    if (plot1) Plotly.purge(plot1);
    if (plot2) Plotly.purge(plot2);
  }
}

/**
 * Calculate required peak AHC speed for given wave and winch conditions.
 * @param {number} waveHeight_m  - Wave height in meters
 * @param {number} wavePeriod_s  - Wave period in seconds
 * @param {number} avgSpeed_mpm  - Average (offset) winch speed in m/min
 * @returns {Object}             - { requiredSpeed_mps, requiredSpeed_mpm }
 */
function calculateRequiredAHCSpeed(waveHeight_m, wavePeriod_s, avgSpeed_mpm) {
  const peakSpeed_mps = Math.PI * waveHeight_m / wavePeriod_s;
  const avgSpeed_mps = avgSpeed_mpm / 60;
  const requiredSpeed_mps = peakSpeed_mps + avgSpeed_mps;
  const requiredSpeed_mpm = requiredSpeed_mps * 60;
  return {
    requiredSpeed_mps,
    requiredSpeed_mpm
  };
}

function displayResults(results, inputs) {
  clearResults();
  if (!results || !results.combined.length) return;

  const summary = document.getElementById('summary');
  summary.innerHTML =
    `Bare Drum Diameter: ${results.bareDrumDiameter_in.toFixed(2)} in<br>` +
    `Full Drum Diameter: ${results.fullDrumDiameter_in.toFixed(2)} in<br>` +
    `Required Free Flange: ${results.reqFreeFlange_in.toFixed(2)} in<br>` +
    `Free Flange: ${results.freeFlange_in.toFixed(2)} in`;

  const tbody = document.querySelector('#resultsTable tbody');
  results.combined.forEach(r => {
    const row = document.createElement('tr');
    row.innerHTML =
      `<td>${r.layer}</td>` +
      `<td>${r.diameter_in.toFixed(2)}</td>` +
      `<td>${r.layer_capacity_m.toFixed(2)}</td>` +
      `<td>${r.cumulative_capacity_m.toFixed(2)}</td>` +
      `<td>${r.depth_m.toFixed(2)}</td>` +
      `<td>${r.tension_kgf.toFixed(1)}</td>` +
      `<td>${r.available_tension_kgf.toFixed(1)}</td>` +
      `<td>${r.actual_speed_mpm.toFixed(2)}</td>` +
      `<td>${r.rpm_speed_mpm.toFixed(2)}</td>` +
      `<td>${r.power_speed_mpm.toFixed(2)}</td>` +
      `<td>${r.required_pressure_psi !== null ? r.required_pressure_psi.toFixed(1) : '-'}</td>`;
    tbody.appendChild(row);
  });

  const depths = results.combined.map(r => r.depth_m).slice().reverse();
  const tensionData = results.combined.map(r => r.tension_kgf).slice().reverse();
  const availTensionData = results.combined.map(r => r.available_tension_kgf).slice().reverse();
  const actualSpeedData = results.combined.map(r => r.actual_speed_mpm).slice().reverse();
  const rpmSpeedData = results.combined.map(r => r.rpm_speed_mpm).slice().reverse();
  const powerSpeedData = results.combined.map(r => r.power_speed_mpm).slice().reverse();

  renderCharts(
    depths,
    tensionData,
    availTensionData,
    actualSpeedData,
    rpmSpeedData,
    powerSpeedData,
    inputs.req_swl,
    inputs.req_speed
  );
  
  const availSpeedsMs = results.combined.map(r => r.actual_speed_mpm / 60).slice().reverse();
  const ahcReq = calculateRequiredAHCSpeed(
    inputs.wave_height,
    inputs.wave_period,
    inputs.avg_offset_speed
  );
  const reqDiv = document.getElementById('required_speed');
  if (reqDiv) {
    reqDiv.textContent = `Required AHC Speed: ${ahcReq.requiredSpeed_mpm.toFixed(2)} m/min (${ahcReq.requiredSpeed_mps.toFixed(2)} m/s)`;
  }
  plotAhcPerformance(ahcReq.requiredSpeed_mps, availSpeedsMs);
  const note = document.getElementById('wraps_note');
  if (note) {
    note.textContent = results.usedCalc
      ? `Calculated wraps per layer used: ${results.baseWraps}`
      : '';
  }

  drawDrumVisualization(results.layers, inputs, results.baseWraps);
  }

function renderCharts(depths, tension, availTension, actualSpeed, rpmSpeed, powerSpeed, swl, reqSpeed) {
  if (typeof Chart === 'undefined') return;

  if (tensionChart) tensionChart.destroy();
  if (speedChart) speedChart.destroy();

  const tctx = document.getElementById('tensionChart').getContext('2d');
  tensionChart = new Chart(tctx, {
    type: 'line',
    data: {
      labels: depths,
      datasets: [
        { label: 'Tension (kgf)', data: tension, borderColor: '#6d4688', fill: false },
        { label: 'Available Tension (kgf)', data: availTension, borderColor: '#4cb3a0', fill: false },
        { label: 'SWL', data: depths.map(() => swl), borderColor: 'gray', borderDash: [5,5], fill: false, pointRadius: 0 }
      ]
    },
    options: {
      scales: {
        x: { title: { display: true, text: 'Depth (m)' } },
        y: { title: { display: true, text: 'kgf' } }
      }
    }
  });

  const sctx = document.getElementById('speedChart').getContext('2d');
  speedChart = new Chart(sctx, {
    type: 'line',
    data: {
      labels: depths,
      datasets: [
        { label: 'Available Speed (m/min)', data: actualSpeed, borderColor: '#5c82a4', fill: false },
        { label: 'RPM Limited Speed (m/min)', data: rpmSpeed, borderColor: '#6d4688', fill: false },
        { label: 'Power Limited Speed (m/min)', data: powerSpeed, borderColor: '#65c98f', fill: false },
        { label: 'Required Speed', data: depths.map(() => reqSpeed), borderColor: 'gray', borderDash: [5,5], fill: false, pointRadius: 0 }
      ]
    },
    options: {
      scales: {
        x: { title: { display: true, text: 'Depth (m)' } },
        y: { title: { display: true, text: 'Speed (m/min)' } }
      }
    }
  });
}

function drawDrumVisualization(layers, inputs, baseWraps) {
  const canvas = document.getElementById('drumCanvas');
  if (!canvas) return;
  if (!drumCtx) drumCtx = canvas.getContext('2d');
    // resize canvas to match displayed size for crisp rendering
  const desiredWidth = canvas.clientWidth;
  const desiredHeight = canvas.clientHeight;
  if (canvas.width !== desiredWidth) canvas.width = desiredWidth;
  if (canvas.height !== desiredHeight) canvas.height = desiredHeight;
  drumCtx.clearRect(0, 0, canvas.width, canvas.height);

  if (!layers || !layers.length) return;

  const flangeDia = inputs.sel_drum_flange_dia;
  const flangeThickness = flangeDia / 10; // represent 1/10 of the flange diameter
  const cableDia = inputs.sel_umb_dia / 25.4; // mm to in
  const flangeSpacing = inputs.sel_drum_flange_to_flange;
  const coreDia = inputs.sel_drum_core_dia;
  const lebus = inputs.sel_drum_lebus_thickness;

  const coreRadius = coreDia / 2;
  const flangeRadius = flangeDia / 2;
  const vertSpacing = 0.866 * cableDia;

  const marginX = 10;
  const marginY = 5;
  const widthIn = flangeSpacing + 2 * flangeThickness + marginX * 2;
  const heightIn = flangeDia + marginY * 2;
  const scale = Math.min(canvas.width / widthIn, canvas.height / heightIn);

  const toX = x => (x + marginX) * scale;
  const toY = y => (heightIn - marginY - y) * scale;

  // flanges
  drumCtx.fillStyle = '#5c82a4';
  drumCtx.strokeStyle = 'black';
  drumCtx.beginPath();
  drumCtx.rect(toX(0), toY(flangeDia), flangeThickness * scale, flangeDia * scale);
  drumCtx.fill();
  drumCtx.stroke();

  drumCtx.beginPath();
  drumCtx.rect(toX(flangeSpacing + flangeThickness), toY(flangeDia), flangeThickness * scale, flangeDia * scale);
  drumCtx.fill();
  drumCtx.stroke();

  // core
  drumCtx.fillStyle = '#5c82a4';
  const coreBottom = (flangeDia - coreDia) / 2;
  drumCtx.beginPath();
  drumCtx.rect(toX(flangeThickness), toY(coreBottom + coreDia), flangeSpacing * scale, coreDia * scale);
  drumCtx.fill();
  drumCtx.stroke();

    // wraps
    drumCtx.strokeStyle = '#6d4688';
    drumCtx.lineWidth = 1;
    const centerY = flangeDia / 2;
    
    if (!baseWraps) baseWraps = layers[0] ? layers[0].wrapsEffective : 0;
    const isHalf = Math.abs(baseWraps % 1 - 0.5) < 1e-6;
    const baseInt = Math.floor(baseWraps);

    let remaining = inputs.sel_cable_length || 0;

    const spacingWhole = (flangeSpacing - cableDia) / (baseWraps - 1);
    const spacingHalf = (flangeSpacing - cableDia / 2) / (baseWraps - 0.5);

    for (let row = 0; row < layers.length && remaining > 0; row++) {
      const wraps = isHalf
        ? baseInt
        : row % 2 === 0
          ? Math.round(baseWraps)
          : Math.max(Math.round(baseWraps) - 1, 1);

      const spacing = isHalf ? spacingHalf : spacingWhole;

      // Vertical placement for this layer:
      const offset = coreRadius + lebus + cableDia / 2 + row * vertSpacing;
      const yTop = centerY + offset;
      const yBottom = centerY - offset;
      const circumference = 2 * Math.PI * offset * 0.0254;

      let startX, step;
      if (row % 2 === 0) {
        startX = flangeThickness + cableDia / 2;
        step = spacing;
      } else {
        startX =
          flangeThickness +
          flangeSpacing -
          cableDia / 2 -
          (isHalf ? 0 : spacing / 2);
        step = -spacing;
      }

      for (let i = 0; i < wraps && remaining > 0; i++) {
        const x = startX + step * i;
        const px = toX(x);
        const r = (cableDia / 2) * scale;
        drumCtx.beginPath();
        drumCtx.arc(px, toY(yTop), r, 0, Math.PI * 2);
        drumCtx.stroke();
        drumCtx.beginPath();
        drumCtx.arc(px, toY(yBottom), r, 0, Math.PI * 2);
        drumCtx.stroke();
        
        remaining -= circumference;
      }
    }

  }


function linspace(start, end, count) {
  if (count <= 0) return [];
  if (count === 1) return [start];
  const step = (end - start) / (count - 1);
  const result = [];
  for (let i = 0; i < count; i++) {
    result.push(start + step * i);
  }
  return result;
}

function plotAhcPerformance(reqSpeed, availSpeeds) {
  if (typeof Plotly === 'undefined') return;

  // custom color scales for the two contour plots
  const colorscale1 = [
    [0 / 8, '#6d4688'], [1 / 8, '#6d4688'],
    [1 / 8, '#68669e'], [2 / 8, '#68669e'],
    [2 / 8, '#5c82a4'], [3 / 8, '#5c82a4'],
    [3 / 8, '#519ba4'], [4 / 8, '#519ba4'],
    [4 / 8, '#4cb3a0'], [5 / 8, '#4cb3a0'],
    [5 / 8, '#65c98f'], [6 / 8, '#65c98f'],
    [6 / 8, '#9cdc6f'], [7 / 8, '#9cdc6f'],
    [7 / 8, '#dfe747'], [1, '#dfe747']
  ];

  const colorscale2 = [
    [0 / 4, '#6d4688'], [0.5 / 4, '#6d4688'],
    [0.5 / 4, '#68669e'], [1 / 4, '#68669e'],
    [1 / 4, '#5c82a4'], [1.5 / 4, '#5c82a4'],
    [1.5 / 4, '#519ba4'], [2 / 4, '#519ba4'],
    [2 / 4, '#4cb3a0'], [2.5 / 4, '#4cb3a0'],
    [2.5 / 4, '#65c98f'], [3 / 4, '#65c98f'],
    [3 / 4, '#9cdc6f'], [3.5 / 4, '#9cdc6f'],
    [3.5 / 4, '#dfe747'], [1, '#dfe747'],
    [1, '#ffffff']
  ];

  const wavePeriods1 = linspace(8, 12, 300);
  const vSpeeds = linspace(0, 2.5, 300);
  const z1 = vSpeeds.map(v => wavePeriods1.map(T => v * T / Math.PI));

    const data1 = [{
    x: wavePeriods1,
    y: vSpeeds,
    z: z1,
    type: 'contour',
    colorscale: colorscale1,
    cmin: 0,
    cmax: 8,    contours: {
      start: 0,
      end: 8,
      size: 0.5,
      coloring: 'heatmap',
      showlines: true,
      color: 'white'
    },
    line: { color: 'white', width: 0.5 },
    colorbar: { title: 'Vertical Displacement (m)' },
    showscale: true
  }];

  const reqLine = {
    x: [8, 12],
    y: [reqSpeed, reqSpeed],
    mode: 'lines',
    line: { color: 'white', width: 2 },
    showlegend: false
  };
  const availLines = availSpeeds.map(s => ({
    x: [8, 12],
    y: [s, s],
    mode: 'lines',
    line: { color: 'white', width: 1, dash: 'dash' },
    showlegend: false
  }));
  const availLabels = availSpeeds.map((s, i) => ({
    x: 11.85,
    y: s,
    text: `Layer ${i + 1}`,
    xanchor: 'right',
    yanchor: 'middle',
    font: { color: 'white', size: 11, family: 'sans-serif', weight: 'bold' },
    showarrow: false
  }));

  Plotly.newPlot(
    'ahcPlot1',
    [data1[0], reqLine, ...availLines],
    {
      title: 'Vertical Displacement vs Wave Period & Max Vertical Speed',
      xaxis: { title: 'Wave Period (s)', range: [8, 12], gridcolor: 'rgba(0,0,0,0.1)', color: '#111' },
      yaxis: { title: 'Maximum Vertical Speed (m/s)', range: [0, 2.5], gridcolor: 'rgba(0,0,0,0.1)', color: '#111' },
      annotations: availLabels,
      font: { family: 'sans-serif', color: '#111', size: 14 },
      plot_bgcolor: '#fff',
      paper_bgcolor: '#fff',
      margin: { l: 60, r: 30, b: 60, t: 70 }
    },
    { responsive: true }
  );


  const waveHeights = linspace(0, 8, 300);
  const wavePeriods2 = linspace(4, 16, 300);
  const z2 = waveHeights.map(h => wavePeriods2.map(T => Math.PI * h / T));

  const contour2 = {
    x: wavePeriods2,
    y: waveHeights,
    z: z2,
    type: 'contour',
    colorscale: colorscale2,
    cmin: 0,
    cmax: 4,    
    contours: {
      start: 0,
      end: 4,
      size: 0.5,
      coloring: 'heatmap',
      showlines: true,
      color: 'white'
    },
    line: { color: 'white', width: 0.5 },
    colorbar: { title: 'Maximum Vertical Speed (m/s)' },
    showscale: true
  };

  const reqIsoX = [];
  const reqIsoY = [];
  wavePeriods2.forEach(T => {
    const H = reqSpeed * T / Math.PI;
    if (H >= 0 && H <= 8) {
      reqIsoX.push(T);
      reqIsoY.push(H);
    }
  });
  const reqIso = {
    x: reqIsoX,
    y: reqIsoY,
    mode: 'lines',
    line: { color: 'white', width: 2 },
    showlegend: false
  };

  const availContours = availSpeeds.map(s => {
    const xs = [];
    const ys = [];
    wavePeriods2.forEach(T => {
      const H = s * T / Math.PI;
      if (H >= 0 && H <= 8) {
        xs.push(T);
        ys.push(H);
      }
    });
    return {
      x: xs,
      y: ys,
      mode: 'lines',
      line: { color: 'white', width: 1, dash: 'dash' },
      showlegend: false
    };
  });

  const availContourLabels = availSpeeds.map((s, i) => {
    const T = 15.8;
    const H = s * T / Math.PI;
    return {
      x: T,
      y: H,
      text: `Layer ${i + 1}`,
      xanchor: 'right',
      yanchor: 'middle',
      font: { color: 'white', size: 11, family: 'sans-serif', weight: 'bold' },
      showarrow: false
    };
  });

  Plotly.newPlot(
    'ahcPlot2',
    [contour2, reqIso, ...availContours],
    {
      title: 'Max Vertical Speed vs Wave Period & Vertical Displacement',
      xaxis: { title: 'Wave Period (s)', range: [4, 16], gridcolor: 'rgba(0,0,0,0.1)', color: '#111' },
      yaxis: { title: 'Vertical Displacement (m)', range: [0, 8], gridcolor: 'rgba(0,0,0,0.1)', color: '#111' },
      annotations: availContourLabels,
      font: { family: 'sans-serif', color: '#111', size: 14 },
      plot_bgcolor: '#fff',
      paper_bgcolor: '#fff',
      margin: { l: 60, r: 30, b: 60, t: 70 }
    },
    { responsive: true }
  );
}

function tryCalculateAndDisplay() {
  const inputs = readInputs();
  const valid = Object.keys(inputs).every(key => {
    if (key === 'winch_type' || key === 'winch_model') return true;
    return inputs[key] !== null && !isNaN(inputs[key]);
  });
  if (valid) {
    const drum = calculateDrumLayers(inputs);
    const perf = calculateWinchPerformance(inputs, drum.layers);
    const combined = combineResults(inputs, drum.layers, perf);
    displayResults({ ...drum, combined }, inputs);
  } else {
    clearResults();
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
    clearResults();
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
  if (getConfigs()['CTW513']) {
    select.value = 'CTW513';
  }  if (select.value) loadConfig(select.value);
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

    const ffIn = flangeToFlange.toNumber('inch');
    const diaIn = cableDia.toNumber('inch');
    const calcWraps = Math.floor((ffIn * 2) / diaIn) / 2;

    const entered = inputs.sel_drum_wraps_per_layer;
    const validWrap =
      entered > 0 && Math.abs(entered * 2 - Math.round(entered * 2)) < 1e-6;

    let baseWraps = validWrap ? entered : calcWraps;
    if (baseWraps < 1) baseWraps = 1;

    const fractional = baseWraps - Math.floor(baseWraps);
    const isHalf = Math.abs(fractional - 0.5) < 1e-6;

    const wrapPattern = isHalf
      ? [baseWraps]
      : [baseWraps, Math.max(baseWraps - 1, 1)];
    const drawPattern = isHalf
      ? [Math.floor(baseWraps)]
      : wrapPattern.map(w => Math.round(w));
    const radInc = cableDia.multiply(PACKING_FACTOR);
    const layers = [];
    let currentRadius = bareDrumRadius;
    let remaining = cableLength;
    let cumulative = u(0, 'm');
    let idx = 0;

    while (remaining.toNumber('m') > 0 && math.smaller(math.add(currentRadius, radInc), flangeRadius)) {
      const wrapsEff = wrapPattern[idx % wrapPattern.length];
      const wrapsDraw = drawPattern[idx % drawPattern.length];
      const nextRadius = math.add(currentRadius, radInc);
      const freeFlange = math.subtract(flangeRadius, nextRadius); // compute free flange immediately

      const circumference = nextRadius.multiply(2 * Math.PI);
      let capacity = circumference.to('m').multiply(wrapsEff);
      if (math.larger(capacity, remaining)) {
        capacity = remaining;
      }
      cumulative = math.add(cumulative, capacity);
      remaining = math.subtract(remaining, capacity);

      layers.push({
        layer: idx + 1,
        wrapsAvailable: wrapsDraw,
        wrapsEffective: wrapsEff,
        diameter_in: nextRadius.multiply(2).to('inch').toNumber(),
        layer_capacity_m: capacity.toNumber('m'),
        cumulative_capacity_m: cumulative.toNumber('m'),
        free_flange_in: freeFlange.to('inch').toNumber(),
        depth_m: cableLength.toNumber('m') - cumulative.toNumber('m')        
      });

      currentRadius = nextRadius; // update radius only after accepting the layer
      idx++;

    }

    const fullDrumDia = currentRadius.multiply(2);

    const finalFreeFlange = math.subtract(flangeRadius, currentRadius);

    const result = {
      numLayers: layers.length,
      bareDrumDiameter_in: bareDrumDia.to('inch').toNumber(),
      fullDrumDiameter_in: fullDrumDia.to('inch').toNumber(),
      reqFreeFlange_in: reqFreeFlange.to('inch').toNumber(),
      freeFlange_in: finalFreeFlange.to('inch').toNumber(),
      baseWraps,
      usedCalc: !validWrap,
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
