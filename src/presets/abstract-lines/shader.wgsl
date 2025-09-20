struct Uniforms {
    time: f32,
    audio_low: f32,
    audio_mid: f32,
    audio_high: f32,
    opacity: f32,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;

// Funcion para generar ruido procedural
fn noise(p: vec2<f32>) -> f32 {
    let K1 = vec2<f32>(23.14069263277926, 2.665144142690225);
    return fract(cos(dot(p, K1)) * 12345.6789);
}

// Funcion para ruido suavizado
fn smoothNoise(p: vec2<f32>) -> f32 {
    let i = floor(p);
    let f = fract(p);
    let u = f * f * (3.0 - 2.0 * f);
    
    return mix(
        mix(noise(i + vec2<f32>(0.0, 0.0)), noise(i + vec2<f32>(1.0, 0.0)), u.x),
        mix(noise(i + vec2<f32>(0.0, 1.0)), noise(i + vec2<f32>(1.0, 1.0)), u.x),
        u.y
    );
}

// Funcion para lineas procedurales dinamicas
fn generateLine(uv: vec2<f32>, time: f32, frequency: f32, amplitude: f32, offset: f32) -> f32 {
    let wave1 = sin(uv.x * frequency + time * 2.0 + offset) * amplitude;
    let wave2 = cos(uv.x * frequency * 1.3 + time * 1.5 + offset + 1.57) * amplitude * 0.6;
    let wave3 = sin(uv.x * frequency * 2.1 + time * 0.8 + offset + 3.14) * amplitude * 0.3;
    
    let combined = wave1 + wave2 + wave3;
    let line = abs(uv.y - combined);
    
    return smoothstep(0.02, 0.0, line);
}

// Funcion para crear patrones de lineas complejos
fn createAbstractPattern(uv: vec2<f32>, time: f32, audioIntensity: f32) -> f32 {
    var pattern = 0.0;
    
    // Lineas primarias (controladas por bajos)
    let primary1 = generateLine(uv, time, 3.0, 0.3 * uniforms.audio_low, 0.0);
    let primary2 = generateLine(uv, time, 2.5, 0.25 * uniforms.audio_low, 2.1);
    let primary3 = generateLine(uv * 1.2, time * 0.8, 4.0, 0.2 * uniforms.audio_low, 4.2);
    
    // Lineas secundarias (controladas por medios)
    let secondary1 = generateLine(uv * 0.8, time * 1.3, 5.0, 0.15 * uniforms.audio_mid, 1.5);
    let secondary2 = generateLine(uv * 1.5, time * 0.7, 6.0, 0.12 * uniforms.audio_mid, 3.7);
    
    // Lineas de detalle (controladas por agudos)
    let detail1 = generateLine(uv * 2.0, time * 2.0, 8.0, 0.08 * uniforms.audio_high, 0.8);
    let detail2 = generateLine(uv * 1.8, time * 1.8, 10.0, 0.06 * uniforms.audio_high, 5.2);
    
    // Combinar todas las lineas
    pattern = primary1 + primary2 + primary3;
    pattern += secondary1 + secondary2;
    pattern += detail1 + detail2;
    
    return pattern;
}

// Funcion para crear ondulaciones de fondo
fn backgroundWaves(uv: vec2<f32>, time: f32) -> f32 {
    let wave1 = sin(uv.x * 1.5 + time * 0.5) * sin(uv.y * 1.8 + time * 0.3);
    let wave2 = cos(uv.x * 2.3 + time * 0.7) * cos(uv.y * 1.2 + time * 0.4);
    let noise_val = smoothNoise(uv * 3.0 + time * 0.2);
    
    let combined = (wave1 + wave2) * 0.1 + noise_val * 0.05;
    return combined * (uniforms.audio_low + uniforms.audio_mid + uniforms.audio_high) * 0.3;
}

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
    var uv = (frag_coord.xy / resolution) * 2.0 - 1.0;
    uv.x *= resolution.x / resolution.y; // Correccion de aspecto
    
    let time = uniforms.time;
    let audioIntensity = (uniforms.audio_low + uniforms.audio_mid + uniforms.audio_high) / 3.0;
    
    // Color de fondo base - azul oscuro muy tenue
    var backgroundColor = vec3<f32>(0.04, 0.06, 0.08);
    
    // Anadir ondulaciones sutiles al fondo
    let waves = backgroundWaves(uv, time);
    backgroundColor += vec3<f32>(waves * 0.2, waves * 0.3, waves * 0.4);
    
    // Crear el patron de lineas abstractas
    let linePattern = createAbstractPattern(uv, time, audioIntensity);
    
    // Colores para las lineas (tenues y suaves)
    let primaryColor = vec3<f32>(0.91, 0.96, 0.97);   // #E8F4F8 - Azul muy tenue
    let secondaryColor = vec3<f32>(0.94, 0.97, 0.91); // #F0F8E8 - Verde muy tenue
    let detailColor = vec3<f32>(0.97, 0.94, 0.91);    // #F8F0E8 - Naranja muy tenue
    let accentColor = vec3<f32>(0.97, 0.91, 0.94);    // #F8E8F0 - Rosa muy tenue
    
    // Mezclar colores basado en la posicion y tiempo para variedad
    let colorMix = sin(uv.x * 2.0 + time * 0.3) * 0.5 + 0.5;
    let colorMix2 = cos(uv.y * 1.5 + time * 0.4) * 0.5 + 0.5;
    
    var lineColor = mix(primaryColor, secondaryColor, colorMix);
    lineColor = mix(lineColor, detailColor, colorMix2 * 0.3);
    lineColor = mix(lineColor, accentColor, audioIntensity * 0.2);
    
    // Aplicar el patron de lineas
    var finalColor = backgroundColor;
    finalColor = mix(finalColor, lineColor, linePattern * 0.8);
    
    // Efecto de parpadeo sutil basado en audio
    let flicker = sin(time * 10.0 + uniforms.audio_high * 20.0) * 0.05 + 0.95;
    finalColor *= flicker;
    
    // Vineta sutil para enfocar el centro
    let vignette = 1.0 - length(uv * 0.5);
    finalColor *= vignette * 0.3 + 0.7;
    
    // Aplicar opacidad global
    let alpha = uniforms.opacity * (0.9 + audioIntensity * 0.1);
    
    return vec4<f32>(finalColor, alpha);
}