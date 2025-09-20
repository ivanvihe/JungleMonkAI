use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use once_cell::sync::Lazy;
use rustfft::{num_complex::Complex, FftPlanner};
use serde::Serialize;
use std::sync::Mutex;
use tauri::AppHandle;
use tokio::sync::watch;

#[derive(Serialize, Clone)]
pub struct AudioData {
    pub fft: Vec<f32>,
    pub low: f32,  // 0-250 Hz
    pub mid: f32,  // 250-4000 Hz
    pub high: f32, // 4000+ Hz
}

static STOP_TX: Lazy<Mutex<Option<watch::Sender<bool>>>> = Lazy::new(|| Mutex::new(None));

pub fn start(app: AppHandle) {
    let (tx, rx) = watch::channel(false);
    *STOP_TX.lock().unwrap() = Some(tx);
    tauri::async_runtime::spawn(async move {
        if let Err(e) = run(app.clone(), rx).await {
            eprintln!("audio error: {e:?}");
        }
    });
    Ok(())
}

pub fn stop() {
    if let Some(tx) = STOP_TX.lock().unwrap().as_ref() {
        let _ = tx.send(true);
    }
}

async fn run(app: AppHandle, mut stop_rx: watch::Receiver<bool>) -> anyhow::Result<()> {
    let host = cpal::default_host();
    let device = host
        .default_input_device()
        .ok_or_else(|| anyhow::anyhow!("no input device"))?;
    let config = device.default_input_config()?;
    let sample_rate = config.sample_rate().0 as f32;
    let fft_size = 1024usize;
    let mut planner = FftPlanner::<f32>::new();
    let fft = planner.plan_fft_forward(fft_size);
    let mut buffer: Vec<Complex<f32>> = vec![Complex { re: 0.0, im: 0.0 }; fft_size];

    let err_app = app.clone();
    let stream = device.build_input_stream(
        &config.into(),
        move |data: &[f32], _| {
            // Llenar buffer FFT
            for (i, sample) in data.iter().enumerate().take(fft_size) {
                buffer[i].re = *sample;
                buffer[i].im = 0.0;
            }

            // Aplicar ventana de Hanning para reducir artifacts
            for (i, sample) in buffer.iter_mut().enumerate().take(fft_size) {
                let window = 0.5
                    * (1.0 - (2.0 * std::f32::consts::PI * i as f32 / (fft_size - 1) as f32).cos());
                sample.re *= window;
            }

            fft.process(&mut buffer);

            // Calcular magnitudes
            let mags: Vec<f32> = buffer.iter().map(|c| c.norm()).collect();

            // Calcular bandas de frecuencia
            let nyquist = sample_rate / 2.0;
            let freq_per_bin = nyquist / (fft_size as f32 / 2.0);

            // Indices for the bands
            let low_end = (250.0 / freq_per_bin) as usize;
            let mid_end = (4000.0 / freq_per_bin) as usize;
            let high_end = fft_size / 2;

            // Calculate average energy per band
            let low_energy: f32 = mags[1..low_end.min(mags.len())].iter().sum();
            let mid_energy: f32 = mags[low_end..mid_end.min(mags.len())].iter().sum();
            let high_energy: f32 = mags[mid_end..high_end.min(mags.len())].iter().sum();

            // Normalizar (valores entre 0 y 1)
            let low_bins = (low_end - 1).max(1) as f32;
            let mid_bins = (mid_end - low_end).max(1) as f32;
            let high_bins = (high_end - mid_end).max(1) as f32;

            let audio_data = AudioData {
                fft: mags,
                low: (low_energy / low_bins / 100.0).min(1.0),
                mid: (mid_energy / mid_bins / 100.0).min(1.0),
                high: (high_energy / high_bins / 100.0).min(1.0),
            };

            let _ = app.emit_all("audio_data", &audio_data);
        },
        move |err| {
            error!("stream error: {err}");
            let _ = err_app.emit_all("error", format!("stream error: {err}"));
        },
    )?;

    stream.play()?;
    // Wait for stop signal
    let _ = stop_rx.changed().await;
    stream.pause()?;
    Ok(())
}
