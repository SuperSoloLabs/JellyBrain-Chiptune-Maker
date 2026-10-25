// copies the shared engine (the brain) from Chip Studio into Jelly Brain, so both programs run the same code
const fs = require('fs'), path = require('path');
const from = path.join(__dirname, '..', 'app', 'src'), to = path.join(__dirname, '..', 'jellybrain_app', 'src');
const files = ['core.js', 'blueprints.js', 'composer.js', 'm_orchestra.js', 'm_scenes.js', 'm_motion.js', 'm_bench.js', 'bench_targets.js', 'chip_common.js', 'snes_inst.js', 'snes_lib.js', 'snes_hifi.js', 'snes_drums_synth.js', 'snes_drums.js', 'snes_dsp.js', 'chip_snes.js', 'atmos.js', 'mind.js', 'm_composer.js', 'm_emotion.js', 'm_imagination.js', 'm_chipkeeper.js', 'm_production.js', 'm_listener.js', 'engine.js'];
for (const f of files) fs.copyFileSync(path.join(from, f), path.join(to, f));
// the LowOrbit LIFT-OFF library lives with Jelly Brain; Chip Studio gets a copy too (one source, two programs)
if (fs.existsSync(path.join(to, 'loworbit_liftoff.js'))) fs.copyFileSync(path.join(to, 'loworbit_liftoff.js'), path.join(from, 'loworbit_liftoff.js'));
console.log('synced', files.length, 'engine files');
