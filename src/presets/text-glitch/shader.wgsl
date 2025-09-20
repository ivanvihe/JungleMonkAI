struct Uniforms {
    time: f32,
    audio_low: f32,
    audio_mid: f32,
    audio_high: f32,
    opacity: f32,
    text_progress: f32,
    glitch_intensity: f32,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;

// Funcion para generar ruido digital
fn digitalNoise(p: vec2<f32>) -> f32 {
    let K1 = vec2<f32>(23.14069263277926, 2.665144142690225);
    return fract(cos(dot(p, K1)) * 12345.6789);
}

// Funcion para efecto de bloque digital
fn digitalBlock(uv: vec2<f32>, blockSize: f32) -> vec2<f32> {
    let block = floor(uv * blockSize) / blockSize;
    return block;
}

// Funcion para renderizar texto procedural (ejemplo basico)
fn renderLetter(uv: vec2<f32>, letter: i32, position: vec2<f32>, size: f32) -> f32 {
    let localUV = (uv - position) / size;
    
    // Verificar si estamos dentro del area de la letra
    if (localUV.x < 0.0 || localUV.x > 1.0 || localUV.y < 0.0 || localUV.y > 1.0) {
        return 0.0;
    }
    
    // Patrones simples para diferentes letras (ejemplo)
    switch letter {
        case 0: { // R
            let vertical = step(0.1, localUV.x) - step(0.2, localUV.x);
            let top = step(0.8, localUV.y) - step(0.9, localUV.y);
            let middle = step(0.5, localUV.y) - step(0.6, localUV.y);
            let diagonal = step(localUV.x * 2.0 - 0.5, localUV.y) - step(localUV.x * 2.0 - 0.3, localUV.y);
            return clamp(vertical + top + middle + diagonal, 0.0, 1.0);
        }
        case 1: { // O
            let center = vec2<f32>(0.5, 0.5);
            let dist = distance(localUV, center);
            return step(0.2, dist) - step(0.4, dist);
        }
        case 2: { // B
            let vertical = step(0.1, localUV.x) - step(0.2, localUV.x);
            let top = step(0.8, localUV.y) - step(0.9, localUV.y);
            let middle = step(0.5, localUV.y) - step(0.6, localUV.y);
            let bottom = step(0.1, localUV.y) - step(0.2, localUV.y);
            return clamp(vertical + top + middle + bottom, 0.0, 1.0);
        }
        default: {
            // Letra generica (rectangulo)
            return step(0.1, localUV.x) - step(0.9, localUV.x) + 
                   step(0.1, localUV.y) - step(0.9, localUV.y);
        }
    }
}

// Funcion para efectos de glitch
fn applyGlitch(uv: vec2<f32>, time: f32, intensity: f32) -> vec2<f32> {
    var glitchedUV = uv;
    
    // Glitch horizontal
    let glitchTime = time * 10.0;
    let glitchLine = floor(uv.y * 50.0);
    let glitchRandom = digitalNoise(vec2<f32>(glitchLine, floor(glitchTime)));
    
    if (glitchRandom > 0.8 && intensity > 0.3) {
        glitchedUV.x += (digitalNoise(vec2<f32>(glitchLine, glitchTime)) - 0.5) * intensity * 0.1;
    }
    
    // Glitch de bloques
    if (intensity > 0.6) {
        let blockUV = digitalBlock(uv, 20.0);
        let blockNoise = digitalNoise(blockUV + time);
        if (blockNoise > 0.9) {
            glitchedUV += (vec2<f32>(digitalNoise(blockUV), digitalNoise(blockUV + 1.0)) - 0.5) * 0.05;
        }
    }
    
    return glitchedUV;
}

// Funcion para aberracion cromatica
fn chromaticAberration(uv: vec2<f32>, intensity: f32) -> vec3<f32> {
    let rOffset = vec2<f32>(intensity * 0.01, 0.0);
    let bOffset = vec2<f32>(-intensity * 0.01, 0.0);
    
    // Simular canales RGB separados
    let r = step(0.5, digitalNoise(uv + rOffset));
    let g = step(0.5, digitalNoise(uv));
    let b = step(0.5, digitalNoise(uv + bOffset));
    
    return vec3<f32>(r, g, b);
}

// Funcion para renderizar el texto "ROBOTICA"
fn renderText(uv: vec2<f32>, time: f32) -> f32 {
    let letterSize = 0.08;
    let spacing = 0.1;
    let startX = -0.4;
    
    var textMask = 0.0;
    
    // Definir posiciones y tiempos de aparicion para cada letra
    let letters = array<i32, 8>(0, 1, 2, 1, 3, 4, 5, 6); // R O B O T I C A
    let appearOrder = array<i32, 8>(3, 7, 1, 5, 0, 2, 4, 6); // Orden desordenado
    let appearTimes = array<f32, 8>(0.0, 0.8, 1.6, 2.4, 3.2, 4.0, 4.8, 5.6);
    
    // Para cada letra
    for (var i = 0; i < 8; i++) {
        let letterIndex = appearOrder[i];
        let appearTime = appearTimes[i];
        
        // Verificar si la letra debe aparecer
        if (time >= appearTime) {
            let letterProgress = min(1.0, (time - appearTime) / 1.2); // Fade in de 1.2 segundos
            
            // Posicion inicial (dispersa) y final
            let finalX = startX + f32(letterIndex) * spacing;
            let finalY = 0.0;
            
            // Posicion inicial aleatoria basada en el indice
            let scatterX = sin(f32(letterIndex) * 23.14) * 0.3 * (1.0 - letterProgress);
            let scatterY = cos(f32(letterIndex) * 31.41) * 0.2 * (1.0 - letterProgress);
            
            let currentX = finalX + scatterX;
            let currentY = finalY + scatterY;
            
            let letterMask = renderLetter(uv, letters[letterIndex], vec2<f32>(currentX, currentY), letterSize);
            textMask += letterMask * letterProgress;
        }
    }
    
    return clamp(textMask, 0.0, 1.0);
}

// Funcion para scanlines
fn scanlines(uv: vec2<f32>, time: f32) -> f32 {
    let scanlineFreq = 400.0;
    let scanlineSpeed = 20.0;
    return sin(uv.y * scanlineFreq + time * scanlineSpeed) * 0.1 + 0.9;
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
    let resolution = vec2<f32>(1920.0, 1080.0);
    var uv = (frag_coord.xy / resolution) * 2.0 - 1.0;
    uv.x *= resolution.x / resolution.y; // Correccion de aspecto
    
    let time = uniforms.time;
    let audioIntensity = (uniforms.audio_low + uniforms.audio_mid + uniforms.audio_high) / 3.0;
    
    // Aplicar efectos glitch a las coordenadas UV
    let glitchIntensity = uniforms.glitch_intensity * (0.5 + uniforms.audio_mid * 0.5);
    let glitchedUV = applyGlitch(uv, time, glitchIntensity);
    
    // Renderizar el texto
    let textMask = renderText(glitchedUV, time);

    // Color de fondo (negro transparente)
    var backgroundColor = vec3<f32>(0.02, 0.03, 0.05);

    // Paleta dinamica inspirada en neones
    let hue = time * 0.2 + audioIntensity * 0.4;
    let primaryColor = vec3<f32>(
        0.5 + 0.5 * sin(hue),
        0.5 + 0.5 * sin(hue + 2.094),
        0.5 + 0.5 * sin(hue + 4.188)
    );
    let glitchColor1 = vec3<f32>(1.0, 0.27, 0.27);   // Rojo glitch
    let glitchColor2 = vec3<f32>(0.27, 0.27, 1.0);   // Azul glitch
    let accentColor = vec3<f32>(0.75, 0.0, 1.0);     // Magenta electrico
    
    // Aplicar aberracion cromatica durante glitch intenso
    var finalTextColor = primaryColor;
    if (glitchIntensity > 0.6) {
        let chromatic = chromaticAberration(glitchedUV, uniforms.audio_high);
        finalTextColor = mix(
            primaryColor,
            vec3<f32>(chromatic.r * glitchColor1.r, chromatic.g * primaryColor.g, chromatic.b * glitchColor2.b),
            0.7
        );
    }
    
    // Efecto de pulso basado en audio
    let pulse = sin(time * 8.0 + uniforms.audio_low * 10.0) * 0.3 + 0.7;
    finalTextColor *= pulse;
    
    // Mezcla de colores glitch aleatoria
    let glitchNoise = digitalNoise(uv * 50.0 + time * 5.0);
    if (glitchNoise > 0.8 && glitchIntensity > 0.4) {
        if (glitchNoise > 0.9) {
            finalTextColor = mix(finalTextColor, glitchColor1, 0.6);
        } else {
            finalTextColor = mix(finalTextColor, glitchColor2, 0.4);
        }
    }
    
    // Color final
    var finalColor = backgroundColor;
    if (textMask > 0.1) {
        finalColor = mix(backgroundColor, finalTextColor, textMask);

        // Efecto de brillo interno
        let glow = smoothstep(0.3, 1.0, textMask) * 0.5;
        finalColor += accentColor * glow * audioIntensity;

        // Chispas electricas aleatorias alrededor del texto
        let spark = step(0.98, digitalNoise(glitchedUV * 300.0 + time * 50.0));
        if (spark > 0.0) {
            finalColor += vec3<f32>(1.0) * spark * 0.3;
        }
    }
    
    // Aplicar scanlines
    let scanlineEffect = scanlines(uv, time);
    finalColor *= scanlineEffect;
    
    // Ruido digital de fondo
    let backgroundNoise = digitalNoise(uv * 100.0 + time * 0.5) * 0.1 * uniforms.audio_high;
    finalColor += vec3<f32>(backgroundNoise);
    
    // Vineta sutil
    let vignette = 1.0 - length(uv * 0.3);
    finalColor *= vignette * 0.7 + 0.3;
    
    // Efecto de interferencia horizontal ocasional
    let interference = step(0.98, digitalNoise(vec2<f32>(uv.y * 10.0, time * 2.0)));
    if (interference > 0.0 && glitchIntensity > 0.3) {
        finalColor = mix(finalColor, vec3<f32>(1.0), 0.3);
    }
    
    // Aplicar opacidad global
    let alpha = uniforms.opacity * (0.95 + audioIntensity * 0.05);
    
    return vec4<f32>(finalColor, alpha);
}