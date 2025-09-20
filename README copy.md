# Jungle Lab Studio

A comprehensive music production suite featuring the **AudioVisualizer**: real-time audio visualization engine.

## Adding new presets

1. Create a folder inside `src/presets/<preset-name>`.
2. Include a `config.json` file that follows the schema defined in [`presets/schema.json`](presets/schema.json).
3. Create a `preset.ts` file that exports `config` and `createPreset`.
4. Optionally add `shader.wgsl` if the preset uses custom shaders.
5. Presets can declare optional visual effects under a `vfx` section in their `config.json`.

The configuration is automatically validated when the application loads using [Ajv](https://ajv.js.org/). If the `config.json` file does not match the schema, the preset will be skipped and an error will be shown in the console.
