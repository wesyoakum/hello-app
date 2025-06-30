 document.getElementById("inputForm").addEventListener("submit", function(event) {
      event.preventDefault();

      const inputs = {
        winch_type: document.getElementById("winch_type").value,
        req_swl: parseFloat(document.getElementById("req_swl").value),
        req_speed: parseFloat(document.getElementById("req_speed").value),
        sel_umb_dia: parseFloat(document.getElementById("sel_umb_dia").value),
        sel_cable_length: parseFloat(document.getElementById("sel_cable_length").value),
        sel_umb_weight: parseFloat(document.getElementById("sel_umb_weight").value),
        sel_drum_core_dia: parseFloat(document.getElementById("sel_drum_core_dia").value),
        sel_drum_lebus_thickness: parseFloat(document.getElementById("sel_drum_lebus_thickness").value),
        sel_drum_flange_dia: parseFloat(document.getElementById("sel_drum_flange_dia").value),
        sel_drum_flange_to_flange: parseFloat(document.getElementById("sel_drum_flange_to_flange").value),
        sel_drum_wraps_per_layer: parseFloat(document.getElementById("sel_drum_wraps_per_layer").value),
        sel_payload_weight: parseFloat(document.getElementById("sel_payload_weight").value),
        sel_hyd_pwr: parseFloat(document.getElementById("sel_pwr").value),
        sel_hyd_sys_press: parseFloat(document.getElementById("sel_hyd_sys_press").value),
        sel_hyd_mech_efficiency: parseFloat(document.getElementById("sel_hyd_mech_efficiency").value)
      };

      // Check for missing/invalid values
      for (const key in inputs) {
        if (inputs[key] === null || isNaN(inputs[key])) {
          alert(`Missing or invalid value: ${key}`);
          return;
        }
      }

      // Save and show
      localStorage.setItem("winch_inputs", JSON.stringify(inputs));
      document.getElementById("output").textContent = JSON.stringify(inputs, null, 2);

      const layerResults = calculateDrumLayers(inputs);
      document.getElementById("layers").textContent = JSON.stringify(layerResults, null, 2);
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

        console.log("Calculated layers:", layers);

        return {
          wrapsPerLayer,
          reqFreeFlange: reqFreeFlange.to('inch').toString(),
          actualFreeFlange: actualFreeFlange.to('inch').toString(),
          layers
        };

      } catch (err) {
        console.error("Error in calculateDrumLayers:", err.message);
        return {
          error: err.message,
          layers: []
        };
      }
    }

    window.addEventListener("DOMContentLoaded", () => {
      const saved = localStorage.getItem("winch_inputs");
      if (saved) {
        const inputs = JSON.parse(saved);
        document.getElementById("output").textContent = saved;

        for (const key in inputs) {
          const field = document.getElementById(key);
          if (field) field.value = inputs[key];
        }

        const layerResults = calculateDrumLayers(inputs);
        document.getElementById("layers").textContent = JSON.stringify(layerResults, null, 2);
      }
    });