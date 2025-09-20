struct Uniforms {
    time: f32,
    audio_low: f32,
    audio_mid: f32,
    audio_high: f32,
    opacity: f32,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;

@vertex
fn vs_main(@builtin(vertex_index) vertex_index: u32) -> @builtin(position) vec4<f32> {
    var pos = array<vec2<f32>, 3>(
        vec2<f32>(-1.0, -1.0),
        vec2<f32>(3.0, -1.0),
        vec2<f32>(-1.0, 3.0)
    );
    return vec4<f32>(pos[vertex_index], 0.0, 1.0);
}

@fragment
fn fs_main(@builtin(position) frag_coord: vec4<f32>) -> @location(0) vec4<f32> {
    let resolution = vec2<f32>(800.0, 600.0);
    let uv = (frag_coord.xy / resolution) * 2.0 - 1.0;
    
    // Background grid effect
    let grid_uv = uv * 10.0;
    let grid = abs(fract(grid_uv) - 0.5) / fwidth(grid_uv);
    let grid_line = 1.0 - min(grid.x, grid.y);
    
    var color = vec3<f32>(0.02, 0.05, 0.08) * smoothstep(0.0, 1.0, grid_line) * 0.3;
    
    // Audio-reactive background
    let audio_avg = (uniforms.audio_low + uniforms.audio_mid + uniforms.audio_high) / 3.0;
    color += vec3<f32>(0.1, 0.2, 0.3) * audio_avg * 0.5;
    
    return vec4<f32>(color * uniforms.opacity, uniforms.opacity);
}