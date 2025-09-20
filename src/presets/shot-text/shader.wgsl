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
    
    // Fondo completamente transparente para que el texto sea la estrella
    var color = vec3<f32>(0.0, 0.0, 0.0);
    var alpha = 0.0;
    
    // Efecto sutil de rejilla de fondo solo si hay audio
    let audio_avg = (uniforms.audio_low + uniforms.audio_mid + uniforms.audio_high) / 3.0;
    
    if (audio_avg > 0.1) {
        // Rejilla muy sutil para contexto
        let grid_uv = uv * 20.0;
        let grid = abs(fract(grid_uv) - 0.5) / fwidth(grid_uv);
        let grid_line = 1.0 - min(grid.x, grid.y);
        
        // Rejilla azul muy tenue
        let grid_intensity = smoothstep(0.0, 1.0, grid_line) * 0.05 * audio_avg;
        color += vec3<f32>(0.1, 0.2, 0.4) * grid_intensity;
        alpha = grid_intensity * 0.3;
    }
    
    // Efecto de vignette sutil para enmarcar el texto
    let vignette_dist = length(uv);
    let vignette = 1.0 - smoothstep(0.8, 1.5, vignette_dist);
    
    // Resplandor ambiental basado en audio
    if (audio_avg > 0.05) {
        let glow_intensity = uniforms.audio_high * 0.1;
        let hue = uniforms.time + uniforms.audio_mid * 5.0;
        let glow_color = vec3<f32>(
            0.5 + 0.5 * sin(hue),
            0.5 + 0.5 * sin(hue + 2.094),
            0.5 + 0.5 * sin(hue + 4.188)
        ) * glow_intensity * vignette;
        color += glow_color;
        alpha = max(alpha, glow_intensity * 0.2);
    }
    
    // Efecto de particulas de fondo para crear atmosfera
    let particle_uv = uv * 5.0 + uniforms.time * 0.1;
    let noise = fract(sin(dot(particle_uv, vec2<f32>(12.9898, 78.233))) * 43758.5453);
    
    if (noise > 0.995 && audio_avg > 0.2) {
        let particle_flash = sin(uniforms.time * 10.0) * 0.5 + 0.5;
        color += vec3<f32>(1.0, 1.0, 1.0) * particle_flash * 0.1 * uniforms.audio_high;
        alpha = max(alpha, particle_flash * 0.1);
    }
    
    // Pulso global sincronizado con el beat
    let pulse = sin(uniforms.time * 2.0) * 0.5 + 0.5;
    let audio_pulse = uniforms.audio_low * pulse * 0.05;
    color += vec3<f32>(0.3, 0.1, 0.5) * audio_pulse;
    alpha = max(alpha, audio_pulse);
    
    return vec4<f32>(color * uniforms.opacity, alpha * uniforms.opacity);
}