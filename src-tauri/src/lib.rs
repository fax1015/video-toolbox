use log::{error, info};
use image::{ImageReader, GenericImageView, ImageFormat};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::Arc;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;
use tokio::sync::Mutex;
use tauri::{Emitter, Manager};

// ============================================================================
// Data Structures
// ============================================================================

fn new_command(program: &str) -> Command {
    let mut cmd = Command::new(program);
    #[cfg(target_os = "windows")]
    cmd.creation_flags(0x08000000);
    cmd
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Filter {
    pub name: String,
    pub extensions: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EncodeOptions {
    pub input: String,
    pub format: String,
    pub codec: Option<String>,
    pub preset: Option<String>,
    pub audio_codec: Option<String>,
    pub crf: Option<u32>,
    pub audio_bitrate: Option<String>,
    pub output_suffix: Option<String>,
    pub fps: Option<String>,
    pub rate_mode: Option<String>,
    pub bitrate: Option<String>,
    pub two_pass: Option<bool>,
    pub audio_tracks: Option<Vec<AudioTrack>>,
    pub subtitle_tracks: Option<Vec<SubtitleTrack>>,
    pub chapters_file: Option<String>,
    pub custom_args: Option<String>,
    pub output_folder: Option<String>,
    pub resolution: Option<String>,
    pub work_priority: Option<String>,
    pub threads: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AudioTrack {
    pub path: Option<String>,
    pub is_source: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SubtitleTrack {
    pub path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExtractAudioOptions {
    pub input: String,
    pub format: String,
    pub bitrate: Option<String>,
    pub sample_rate: Option<String>,
    pub mp3_mode: Option<String>,
    pub mp3_quality: Option<String>,
    pub flac_level: Option<String>,
    pub work_priority: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrimVideoOptions {
    pub input: String,
    pub start_seconds: f64,
    pub end_seconds: f64,
    pub output_folder: Option<String>,
    pub work_priority: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DownloadOptions {
    pub url: String,
    pub output_path: Option<String>,
    pub format: Option<String>,
    pub quality: Option<String>,
    pub mode: Option<String>,
    pub audio_format: Option<String>,
    pub audio_bitrate: Option<String>,
    pub fps: Option<String>,
    pub video_bitrate: Option<String>,
    pub video_codec: Option<String>,
    pub file_name: Option<String>,
    pub format_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VideoMetadata {
    pub resolution: Option<String>,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub duration: Option<String>,
    pub duration_seconds: Option<f64>,
    pub bitrate: Option<String>,
    pub fps: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageInfo {
    pub width: u32,
    pub height: u32,
    pub codec: String,
    pub pixel_format: String,
    pub color_space: String,
    pub bit_depth: String,
    pub format: String,
    pub size_bytes: u64,
    pub mtime_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProgressEvent {
    pub percent: f64,
    pub time: String,
    pub speed: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DownloadProgress {
    pub percent: Option<f64>,
    pub size: Option<String>,
    pub speed: Option<String>,
    pub eta: Option<String>,
    pub status: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EncoderInfo {
    pub nvenc: bool,
    pub amf: bool,
    pub qsv: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VideoInfoResult {
    pub is_playlist: bool,
    pub title: Option<String>,
    pub thumbnail: Option<String>,
    pub duration: Option<String>,
    pub channel: Option<String>,
    pub is_video: Option<bool>,
    pub formats: Option<Vec<serde_json::Value>>,
    pub url: Option<String>,
    pub count: Option<u32>,
    pub entries: Option<Vec<serde_json::Value>>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThumbnailResult {
    pub data: String,
    pub count: u32,
    pub cols: u32,
    pub rows: u32,
    pub interval: f64,
}

// ============================================================================
// Global State for Process Management
// ============================================================================

struct AppState {
    current_pid: Mutex<Option<u32>>,
    current_output_path: Mutex<Option<String>>,
    is_cancelling: Mutex<bool>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            current_pid: Mutex::new(None),
            current_output_path: Mutex::new(None),
            is_cancelling: Mutex::new(false),
        }
    }
}

// ============================================================================
// Utility Functions
// ============================================================================

fn get_ffmpeg_path() -> String {
    // Try to find ffmpeg in PATH or in bin folder
    // First check if bundled in resources
    if let Ok(exe_path) = std::env::current_exe() {
        let bin_path = exe_path.parent().map(|p| p.join("bin").join("ffmpeg.exe"));
        if let Some(path) = bin_path {
            if path.exists() {
                return path.to_string_lossy().to_string();
            }
        }
    }
    // Fallback to system PATH
    "ffmpeg".to_string()
}

fn get_ffprobe_path() -> String {
    if let Ok(exe_path) = std::env::current_exe() {
        let bin_path = exe_path.parent().map(|p| p.join("bin").join("ffprobe.exe"));
        if let Some(path) = bin_path {
            if path.exists() {
                return path.to_string_lossy().to_string();
            }
        }
    }
    "ffprobe".to_string()
}

fn get_ytdlp_path() -> String {
    if let Ok(exe_path) = std::env::current_exe() {
        let bin_path = exe_path.parent().map(|p| p.join("bin").join("yt-dlp.exe"));
        if let Some(path) = bin_path {
            if path.exists() {
                return path.to_string_lossy().to_string();
            }
        }
    }
    "yt-dlp".to_string()
}

fn validate_path(input_path: &str) -> Option<PathBuf> {
    if input_path.is_empty() {
        return None;
    }
    let path = PathBuf::from(input_path);
    if path.exists() {
        Some(path)
    } else {
        None
    }
}

fn validate_url(url: &str) -> bool {
    if let Ok(url_obj) = url::Url::parse(url) {
        url_obj.scheme() == "http" || url_obj.scheme() == "https"
    } else {
        false
    }
}

// ============================================================================
// Dialog Commands
// ============================================================================

#[tauri::command]
async fn select_file(app: tauri::AppHandle, filters: Option<Vec<Filter>>, _allow_all: Option<bool>) -> Result<Option<String>, String> {
    info!("select_file called with filters: {:?}", filters);
    
    use tauri_plugin_dialog::DialogExt;
    
    let mut builder = app.dialog().file();
    
    if let Some(f) = filters {
        for filter in f {
            let extensions: Vec<&str> = filter.extensions.iter().map(|s| s.as_str()).collect();
            builder = builder.add_filter(filter.name, &extensions);
        }
    }
    
    let result = builder.blocking_pick_file();
    
    Ok(result.map(|p| p.to_string()))
}

#[tauri::command]
async fn select_files(app: tauri::AppHandle, filters: Option<Vec<Filter>>, _allow_all: Option<bool>) -> Result<Vec<String>, String> {
    info!("select_files called with filters: {:?}", filters);
    
    use tauri_plugin_dialog::DialogExt;
    
    let mut builder = app.dialog().file();

    if let Some(f) = filters {
        for filter in f {
            let extensions: Vec<&str> = filter.extensions.iter().map(|s| s.as_str()).collect();
            builder = builder.add_filter(filter.name, &extensions);
        }
    }
    
    let result = builder.blocking_pick_files();
    
    Ok(result.map(|paths| paths.into_iter().map(|p| p.to_string()).collect()).unwrap_or_default())
}

#[tauri::command]
async fn save_file(app: tauri::AppHandle, _filters: Option<Vec<Filter>>, default_name: Option<String>, _title: Option<String>) -> Result<Option<String>, String> {
    info!("save_file called with default_name: {:?}", default_name);
    
    use tauri_plugin_dialog::DialogExt;
    
    let result = app.dialog()
        .file()
        .set_file_name(default_name.unwrap_or_else(|| "output.mp4".to_string()))
        .blocking_save_file();
    
    Ok(result.map(|p| p.to_string()))
}

#[tauri::command]
async fn select_folder(app: tauri::AppHandle) -> Result<Option<String>, String> {
    info!("select_folder called");
    
    use tauri_plugin_dialog::DialogExt;
    
    let result = app.dialog()
        .file()
        .blocking_pick_folder();
    
    Ok(result.map(|p| p.to_string()))
}

// ============================================================================
// Utility Commands
// ============================================================================

#[tauri::command]
async fn list_files(directory: String, extensions: Option<Vec<String>>) -> Result<Vec<String>, String> {
    info!("list_files called for directory: {}", directory);
    
    let path = PathBuf::from(&directory);
    if !path.exists() || !path.is_dir() {
        return Err("Invalid directory path".to_string());
    }
    
    let video_extensions = extensions.unwrap_or_else(|| {
        vec!["mp4".to_string(), "mkv".to_string(), "avi".to_string(), "mov".to_string(), "webm".to_string(), "flv".to_string(), "wmv".to_string()]
    });
    
    let mut files = Vec::new();
    
    if let Ok(entries) = std::fs::read_dir(&path) {
        for entry in entries.flatten() {
            if let Ok(file_type) = entry.file_type() {
                if file_type.is_file() {
                    if let Some(ext) = entry.path().extension() {
                        let ext_str = ext.to_string_lossy().to_lowercase();
                        if video_extensions.iter().any(|e| e.to_lowercase() == ext_str) {
                            files.push(entry.path().to_string_lossy().to_string());
                        }
                    }
                }
            }
        }
    }
    
    Ok(files)
}

#[tauri::command]
async fn get_app_version(app: tauri::AppHandle) -> Result<String, String> {
    info!("get_app_version called");
    Ok(app.package_info().version.to_string())
}

// ============================================================================
// FFmpeg Commands
// ============================================================================

#[tauri::command]
async fn get_encoders() -> Result<EncoderInfo, String> {
    info!("get_encoders called");
    
    let ffmpeg_path = get_ffmpeg_path();
    
    let output = Command::new(&ffmpeg_path)
        .args(&["-encoders"])
        .output()
        .await
        .map_err(|e| format!("Failed to run ffmpeg: {}", e))?;
    
    let output_str = String::from_utf8_lossy(&output.stdout);
    let stderr_str = String::from_utf8_lossy(&output.stderr);
    let combined = format!("{}{}", output_str, stderr_str);
    
    let encoders = EncoderInfo {
        nvenc: combined.contains("h264_nvenc") || combined.contains("hevc_nvenc"),
        amf: combined.contains("h264_amf") || combined.contains("hevc_amf"),
        qsv: combined.contains("h264_qsv") || combined.contains("hevc_qsv"),
    };
    
    Ok(encoders)
}

#[tauri::command]
async fn get_metadata(file_path: String) -> Result<VideoMetadata, String> {
    info!("get_metadata called for: {}", file_path);
    
    let validated = validate_path(&file_path).ok_or("Invalid file path")?;
    let path_str = validated.to_string_lossy().to_string();
    
    // Use ffprobe to get basic metadata
    let ffprobe_path = get_ffprobe_path();
    let output = new_command(&ffprobe_path)
        .args(&[
            "-v", "error",
            "-select_streams", "v:0",
            "-show_entries", "stream=width,height,r_frame_rate",
            "-of", "csv=p=0",
            &path_str
        ])
        .output()
        .await
        .map_err(|e| format!("Failed to run ffprobe: {}", e))?;
    
    let output_str = String::from_utf8_lossy(&output.stdout);
    
    // Parse resolution
    let mut resolution = "Unknown".to_string();
    let mut width: Option<u32> = None;
    let mut height: Option<u32> = None;
    let mut fps: Option<f64> = None;
    
    for line in output_str.lines() {
        let parts: Vec<&str> = line.split(',').collect();
        if parts.len() >= 2 {
            width = parts[0].parse().ok();
            height = parts[1].parse().ok();
            if width.is_some() && height.is_some() {
                resolution = format!("{}x{}", width.unwrap(), height.unwrap());
            }
            if parts.len() >= 3 {
                if let Some((num, den)) = parts[2].split_once('/') {
                    if let (Ok(n), Ok(d)) = (num.parse::<f64>(), den.parse::<f64>()) {
                        if d > 0.0 {
                            fps = Some(n / d);
                        }
                    }
                }
            }
        }
    }
    
    // Get duration and bitrate
    let output2 = new_command(&ffprobe_path)
        .args(&[
            "-v", "error",
            "-show_entries", "format=duration,bit_rate",
            "-of", "csv=p=0",
            &path_str
        ])
        .output()
        .await;
    
    let mut duration = "00:00:00".to_string();
    let mut duration_seconds: Option<f64> = None;
    let mut bitrate: Option<String> = None;
    
    if let Ok(output2) = output2 {
        let output2_str = String::from_utf8_lossy(&output2.stdout);
        for line in output2_str.lines() {
            let parts: Vec<&str> = line.split(',').collect();
            if parts.len() >= 1 {
                if let Ok(dur) = parts[0].parse::<f64>() {
                    duration_seconds = Some(dur);
                    let hours = (dur / 3600.0).floor() as u32;
                    let mins = ((dur % 3600.0) / 60.0).floor() as u32;
                    let secs = (dur % 60.0).floor() as u32;
                    duration = format!("{:02}:{:02}:{:02}", hours, mins, secs);
                }
            }
            if parts.len() >= 2 {
                if let Ok(br) = parts[1].parse::<u64>() {
                    bitrate = Some(format!("{} kbps", br / 1000));
                }
            }
        }
    }
    
    Ok(VideoMetadata {
        resolution: Some(resolution),
        width,
        height,
        duration: Some(duration),
        duration_seconds,
        bitrate,
        fps,
    })
}

#[tauri::command]
async fn get_metadata_full(file_path: String) -> Result<serde_json::Value, String> {
    info!("get_metadata_full called for: {}", file_path);
    
    let validated = validate_path(&file_path).ok_or("Invalid file path")?;
    let path_str = validated.to_string_lossy().to_string();
    info!("Validated path: {}", path_str);
    
    let ffprobe_path = get_ffprobe_path();
    let output = new_command(&ffprobe_path)
        .args(&[
            "-v", "error",
            "-print_format", "json",
            "-show_entries", "format=format_name,duration,size,bit_rate:format_tags=title,artist,album,date,genre,track,comment:stream=codec_type,codec_name,width,height,r_frame_rate,bit_rate,pix_fmt,sample_rate,channels,channel_layout:stream_tags=language",
            "-show_format",
            "-show_streams",
            &path_str
        ])
        .output()
        .await
        .map_err(|e| format!("Failed to run ffprobe: {}", e))?;
    
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("ffprobe failed: {}", stderr));
    }
    
    let json_str = String::from_utf8_lossy(&output.stdout);
    serde_json::from_str(&json_str).map_err(|e| format!("Failed to parse JSON: {}", e))
}

#[tauri::command]
async fn get_image_info(file_path: String) -> Result<ImageInfo, String> {
    info!("get_image_info called for: {}", file_path);
    
    let validated = validate_path(&file_path).ok_or("Invalid file path")?;
    let path_str = validated.to_string_lossy().to_string();
    
    let ffprobe_path = get_ffprobe_path();
    let output = new_command(&ffprobe_path)
        .args(&[
            "-v", "error",
            "-print_format", "json",
            "-show_entries", "format=format_name,size:stream=codec_name,width,height,pix_fmt,color_space,color_primaries,bits_per_raw_sample,bits_per_sample",
            &path_str
        ])
        .output()
        .await
        .map_err(|e| format!("Failed to run ffprobe: {}", e))?;
    
    if !output.status.success() {
        return Err("ffprobe failed".to_string());
    }
    
    let json_str = String::from_utf8_lossy(&output.stdout);
    let data: serde_json::Value = serde_json::from_str(&json_str)
        .map_err(|e| format!("Failed to parse JSON: {}", e))?;
    
    let streams = data.get("streams").and_then(|s| s.as_array());
    let stream = streams.and_then(|s| s.first());
    
    let format = data.get("format").and_then(|f| f.as_object());
    
    let width = stream.and_then(|s| s.get("width")).and_then(|v| v.as_u64()).unwrap_or(0) as u32;
    let height = stream.and_then(|s| s.get("height")).and_then(|v| v.as_u64()).unwrap_or(0) as u32;
    let codec = stream.and_then(|s| s.get("codec_name")).and_then(|v| v.as_str()).unwrap_or("").to_string();
    let pixel_format = stream.and_then(|s| s.get("pix_fmt")).and_then(|v| v.as_str()).unwrap_or("").to_string();
    let color_space = stream.and_then(|s| s.get("color_space")).or_else(|| stream.and_then(|s| s.get("color_primaries"))).and_then(|v| v.as_str()).unwrap_or("").to_string();
    let bit_depth = stream.and_then(|s| s.get("bits_per_raw_sample")).or_else(|| stream.and_then(|s| s.get("bits_per_sample"))).and_then(|v| v.as_str()).unwrap_or("").to_string();
    let format_name = format.and_then(|f| f.get("format_name")).and_then(|v| v.as_str()).unwrap_or("").to_string();
    let mut size_bytes = format.and_then(|f| f.get("size")).and_then(|v| v.as_str()).and_then(|s| s.parse::<u64>().ok()).unwrap_or(0);
    
    let metadata = std::fs::metadata(&validated).ok();
    if size_bytes == 0 {
        size_bytes = metadata.as_ref().map(|m| m.len()).unwrap_or(0);
    }
    
    let mtime_ms = metadata
        .and_then(|m| m.modified().ok())
        .map(|t| t.duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_millis() as u64)
        .unwrap_or(0);
    
    Ok(ImageInfo {
        width,
        height,
        codec,
        pixel_format,
        color_space,
        bit_depth,
        format: format_name,
        size_bytes,
        mtime_ms,
    })
}

#[tauri::command]
async fn save_metadata(file_path: String, metadata: serde_json::Value) -> Result<(), String> {
    info!("save_metadata called for: {}", file_path);
    
    let validated = validate_path(&file_path).ok_or("Invalid file path")?;
    let path_str = validated.to_string_lossy().to_string();
    
    // Build metadata arguments
    let mut args = vec![
        "-y".to_string(),
        "-i".to_string(),
        path_str.clone(),
        "-c".to_string(),
        "copy".to_string(),
    ];
    
    // Add metadata
    if let Some(title) = metadata.get("title").and_then(|v| v.as_str()) {
        args.push("-metadata".to_string());
        args.push(format!("title={}", title));
    }
    if let Some(artist) = metadata.get("artist").and_then(|v| v.as_str()) {
        args.push("-metadata".to_string());
        args.push(format!("artist={}", artist));
    }
    if let Some(album) = metadata.get("album").and_then(|v| v.as_str()) {
        args.push("-metadata".to_string());
        args.push(format!("album={}", album));
    }
    if let Some(year) = metadata.get("year").and_then(|v| v.as_str()) {
        args.push("-metadata".to_string());
        args.push(format!("date={}", year));
    }
    if let Some(genre) = metadata.get("genre").and_then(|v| v.as_str()) {
        args.push("-metadata".to_string());
        args.push(format!("genre={}", genre));
    }
    if let Some(track) = metadata.get("track").and_then(|v| v.as_str()) {
        args.push("-metadata".to_string());
        args.push(format!("track={}", track));
    }
    if let Some(comment) = metadata.get("comment").and_then(|v| v.as_str()) {
        args.push("-metadata".to_string());
        args.push(format!("comment={}", comment));
    }
    
    // Output path
    let parent = validated.parent().map(|p| p.to_path_buf());
    let stem = validated.file_stem().map(|s| s.to_string_lossy().to_string()).unwrap_or_default();
    let ext = validated.extension().map(|e| e.to_string_lossy().to_string()).unwrap_or_default();
    let temp_path = parent.map(|p| p.join(format!("{}_temp.{}", stem, ext))).unwrap_or_else(|| PathBuf::from("temp_output.mp4"));
    args.push(temp_path.to_string_lossy().to_string());
    
    let ffmpeg_path = get_ffmpeg_path();
    let output = new_command(&ffmpeg_path)
        .args(&args)
        .output()
        .await
        .map_err(|e| format!("Failed to run ffmpeg: {}", e))?;
    
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("ffmpeg failed: {}", stderr));
    }
    
    // Replace original with temp file
    std::fs::rename(&temp_path, &validated).map_err(|e| format!("Failed to replace file: {}", e))?;
    
    Ok(())
}

// ============================================================================
// Encoding Commands
// ============================================================================

#[tauri::command]
async fn start_encode(app: tauri::AppHandle, options: EncodeOptions) -> Result<(), String> {
    info!("start_encode called with options: {:?}", options);
    
    let state = app.state::<Arc<AppState>>();
    
    let ffmpeg_path = get_ffmpeg_path();
    
    // Build output path
    let input_path = PathBuf::from(&options.input);
    let stem = input_path.file_stem().map(|s| s.to_string_lossy().to_string()).unwrap_or_default();
    let output_ext = options.format.clone();
    let suffix = options.output_suffix.clone().unwrap_or_else(|| "_encoded".to_string());
    let filename = format!("{}{}.{}", stem, suffix, output_ext);
    
    let output_path = if let Some(folder) = &options.output_folder {
        PathBuf::from(folder).join(&filename)
    } else {
        input_path.parent().map(|p| p.join(&filename)).unwrap_or_else(|| PathBuf::from(&filename))
    };
    
    let output_path_str = output_path.to_string_lossy().to_string();
    
    // Build FFmpeg arguments
    let mut args = vec![
        "-i".to_string(),
        options.input.clone(),
    ];
    
    // Add external audio tracks
    if let Some(audio_tracks) = &options.audio_tracks {
        for track in audio_tracks {
            if let Some(path) = &track.path {
                args.push("-i".to_string());
                args.push(path.clone());
            }
        }
    }
    
    // Add external subtitle tracks
    if let Some(subtitle_tracks) = &options.subtitle_tracks {
        for track in subtitle_tracks {
            if let Some(path) = &track.path {
                args.push("-i".to_string());
                args.push(path.clone());
            }
        }
    }
    
    args.push("-y".to_string());
    args.push("-map".to_string());
    args.push("0:v:0".to_string());
    
    // Audio mapping
    if options.audio_codec.as_deref() == Some("none") {
        args.push("-an".to_string());
    } else {
        args.push("-map".to_string());
        args.push("0:a:0".to_string());
    }
    
    // Subtitle mapping
    args.push("-map".to_string());
    args.push("0:s?".to_string());
    
    // Video codec
    if let Some(codec) = &options.codec {
        if codec == "copy" {
            args.push("-c:v".to_string());
            args.push("copy".to_string());
        } else {
            let v_codec_map = HashMap::from([
                ("h264", "libx264"),
                ("h265", "libx265"),
                ("vp9", "libvpx-vp9"),
                ("h264_nvenc", "h264_nvenc"),
                ("hevc_nvenc", "hevc_nvenc"),
                ("h264_amf", "h264_amf"),
                ("hevc_amf", "hevc_amf"),
                ("h264_qsv", "h264_qsv"),
                ("hevc_qsv", "hevc_qsv"),
            ]);
            
            let v_codec = v_codec_map.get(codec.as_str()).unwrap_or(&"libx264");
            args.push("-c:v".to_string());
            args.push(v_codec.to_string());
            
            // Resolution scaling
            if let Some(resolution) = &options.resolution {
                if resolution != "source" {
                    let scale_heights = HashMap::from([
                        ("4320p", "4320"),
                        ("2160p", "2160"),
                        ("1080p", "1080"),
                        ("720p", "720"),
                        ("480p", "480"),
                        ("360p", "360"),
                    ]);
                    if let Some(h) = scale_heights.get(resolution.as_str()) {
                        args.push("-vf".to_string());
                        args.push(format!("scale=-2:{}", h));
                    }
                }
            }
            
            // Preset
            if let Some(preset) = &options.preset {
                args.push("-preset".to_string());
                args.push(preset.clone());
            }
            
            // Rate control
            if options.rate_mode.as_deref() == Some("bitrate") {
                if let Some(bitrate) = &options.bitrate {
                    args.push("-b:v".to_string());
                    args.push(format!("{}k", bitrate));
                }
            } else {
                if let Some(crf) = options.crf {
                    args.push("-crf".to_string());
                    args.push(crf.to_string());
                }
            }
            
            // FPS
            if let Some(fps) = &options.fps {
                if fps != "source" {
                    args.push("-r".to_string());
                    args.push(fps.clone());
                }
            }
        }
    }
    
    // Audio codec
    if let Some(audio_codec) = &options.audio_codec {
        if audio_codec != "none" {
            if audio_codec == "copy" {
                args.push("-c:a".to_string());
                args.push("copy".to_string());
            } else {
                let a_codec_map = HashMap::from([
                    ("aac", "aac"),
                    ("opus", "libopus"),
                    ("mp3", "libmp3lame"),
                    ("ac3", "ac3"),
                    ("flac", "flac"),
                    ("pcm_s16le", "pcm_s16le"),
                ]);
                
                let a_codec = a_codec_map.get(audio_codec.as_str()).unwrap_or(&"aac");
                args.push("-c:a".to_string());
                args.push(a_codec.to_string());
                
                if let Some(bitrate) = &options.audio_bitrate {
                    args.push("-b:a".to_string());
                    args.push(bitrate.clone());
                }
            }
        }
    }
    
    // Subtitle codec
    if output_ext == "mp4" || output_ext == "mov" {
        args.push("-c:s".to_string());
        args.push("mov_text".to_string());
    } else {
        args.push("-c:s".to_string());
        args.push("copy".to_string());
    }
    
    // Threads
    if let Some(threads) = options.threads {
        if threads > 0 {
            args.push("-threads".to_string());
            args.push(threads.to_string());
        }
    }
    
    // Custom args
    if let Some(custom_args) = &options.custom_args {
        args.extend(custom_args.split_whitespace().map(|s| s.to_string()));
    }
    
    args.push(output_path_str.clone());
    
    info!("Running FFmpeg with args: {:?}", args);
    
    // Spawn FFmpeg process
    let mut child = Command::new(&ffmpeg_path)
        .args(&args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn ffmpeg: {}", e))?;
    
    // Store process ID for later cancellation
    let child_pid = child.id();
    {
        let mut pid = state.current_pid.lock().await;
        *pid = child_pid;
    }
    {
        let mut output_path = state.current_output_path.lock().await;
        *output_path = Some(output_path_str.clone());
    }
    
    // Read stderr for progress
    if let Some(stderr) = child.stderr.take() {
        let reader = BufReader::new(stderr);
        let mut lines = reader.lines();
        let app_handle = app.clone();
        
        tokio::spawn(async move {
            let mut duration_in_seconds = 0.0;
            
            while let Ok(Some(line)) = lines.next_line().await {
                // Parse duration
                if duration_in_seconds == 0.0 {
                    if let Some(cap) = regex::Regex::new(r"Duration: (\d{2}):(\d{2}):(\d{2})\.\d{2}")
                        .ok()
                        .and_then(|re| re.captures(&line))
                    {
                        let h: f64 = cap.get(1).and_then(|m| m.as_str().parse().ok()).unwrap_or(0.0);
                        let m: f64 = cap.get(2).and_then(|m| m.as_str().parse().ok()).unwrap_or(0.0);
                        let s: f64 = cap.get(3).and_then(|m| m.as_str().parse().ok()).unwrap_or(0.0);
                        duration_in_seconds = h * 3600.0 + m * 60.0 + s;
                    }
                }
                
                // Parse progress
                if duration_in_seconds > 0.0 {
                    if let Some(cap) = regex::Regex::new(r"time=(\d{2}):(\d{2}):(\d{2})\.\d{2}")
                        .ok()
                        .and_then(|re| re.captures(&line))
                    {
                        let h: f64 = cap.get(1).and_then(|m| m.as_str().parse().ok()).unwrap_or(0.0);
                        let m: f64 = cap.get(2).and_then(|m| m.as_str().parse().ok()).unwrap_or(0.0);
                        let s: f64 = cap.get(3).and_then(|m| m.as_str().parse().ok()).unwrap_or(0.0);
                        let current_time = h * 3600.0 + m * 60.0 + s;
                        let percent = (current_time / duration_in_seconds * 100.0).min(99.0);
                        
                        let speed_cap = regex::Regex::new(r"speed=\s*(\d+\.?\d*x)")
                            .ok()
                            .and_then(|re| re.captures(&line));
                        let speed = speed_cap
                            .and_then(|c| c.get(1))
                            .map(|m| m.as_str().to_string())
                            .unwrap_or_else(|| "0.00x".to_string());
                        
                        let _ = app_handle.emit("encode-progress", serde_json::json!({
                            "percent": percent,
                            "time": format!("{:02}:{:02}:{:02}", (current_time / 3600.0).floor() as u32, ((current_time % 3600.0) / 60.0).floor() as u32, (current_time % 60.0).floor() as u32),
                            "speed": speed
                        }));
                    }
                }
            }
        });
    }
    
    // Wait for completion
    let status = child.wait().await.map_err(|e| format!("FFmpeg process error: {}", e))?;
    
    // Clear process reference
    {
        let mut pid = state.current_pid.lock().await;
        *pid = None;
    }
    {
        let mut output_path = state.current_output_path.lock().await;
        *output_path = None;
    }
    
    // Check cancellation
    let is_cancelling = {
        let cancel = state.is_cancelling.lock().await;
        *cancel
    };
    
    if is_cancelling {
        let mut cancel = state.is_cancelling.lock().await;
        *cancel = false;
        let _ = app.emit("encode-cancelled", ());
        
        // Delete incomplete output
        if output_path.exists() {
            let _ = std::fs::remove_file(&output_path);
        }
        
        return Ok(());
    }
    
    if status.success() {
        let _ = app.emit("encode-complete", serde_json::json!({ "outputPath": output_path_str }));
    } else {
        let _ = app.emit("encode-error", serde_json::json!({ "message": format!("FFmpeg exited with code {:?}", status.code()) }));
    }
    
    Ok(())
}

#[tauri::command]
async fn extract_audio(app: tauri::AppHandle, options: ExtractAudioOptions) -> Result<(), String> {
    info!("extract_audio called for: {}", options.input);
    
    let state = app.state::<Arc<AppState>>();
    let ffmpeg_path = get_ffmpeg_path();
    
    // Build output path
    let input_path = PathBuf::from(&options.input);
    let stem = input_path.file_stem().map(|s| s.to_string_lossy().to_string()).unwrap_or_default();
    let ext_map = HashMap::from([
        ("mp3", "mp3"),
        ("aac", "m4a"),
        ("flac", "flac"),
        ("wav", "wav"),
        ("ogg", "ogg"),
        ("opus", "opus"),
    ]);
    let ext = ext_map.get(options.format.as_str()).unwrap_or(&"mp3");
    let output_path = input_path.parent().map(|p| p.join(format!("{}_audio.{}", stem, ext))).unwrap_or_else(|| PathBuf::from(format!("{}_audio.{}", stem, ext)));
    let output_path_str = output_path.to_string_lossy().to_string();
    
    // Build args
    let mut args = vec![
        "-y".to_string(),
        "-i".to_string(),
        options.input.clone(),
        "-vn".to_string(),
    ];
    
    // Audio codec
    let codec_map = HashMap::from([
        ("mp3", ("libmp3lame", None)),
        ("aac", ("aac", None)),
        ("flac", ("flac", Some("compression_level"))),
        ("wav", ("pcm_s16le", None)),
        ("ogg", ("libvorbis", None)),
        ("opus", ("libopus", None)),
    ]);
    
    if let Some((codec, _)) = codec_map.get(options.format.as_str()) {
        args.push("-c:a".to_string());
        args.push(codec.to_string());
    }
    
    // Sample rate
    if let Some(sample_rate) = &options.sample_rate {
        let allowed = ["44100", "48000", "96000"];
        if allowed.contains(&sample_rate.as_str()) {
            args.push("-ar".to_string());
            args.push(sample_rate.clone());
        }
    }
    
    // FLAC compression level
    if options.format == "flac" {
        if let Some(level) = &options.flac_level {
            let allowed = ["0", "1", "2", "3", "4", "5", "6", "7", "8"];
            if allowed.contains(&level.as_str()) {
                args.push("-compression_level".to_string());
                args.push(level.clone());
            }
        }
    }
    
    // MP3 quality
    if options.format == "mp3" && options.mp3_mode.as_deref() == Some("vbr") {
        if let Some(quality) = &options.mp3_quality {
            args.push("-q:a".to_string());
            args.push(quality.clone());
        }
    } else if let Some(bitrate) = &options.bitrate {
        args.push("-b:a".to_string());
        args.push(bitrate.clone());
    }
    
    args.push(output_path_str.clone());
    
    // Spawn FFmpeg
    let mut child = Command::new(&ffmpeg_path)
        .args(&args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn ffmpeg: {}", e))?;
    
    // Store process reference
    let child_pid = child.id();
    {
        let mut pid = state.current_pid.lock().await;
        *pid = child_pid;
    }
    {
        let mut output_path = state.current_output_path.lock().await;
        *output_path = Some(output_path_str.clone());
    }
    
    // Read stderr for progress
    if let Some(stderr) = child.stderr.take() {
        let reader = BufReader::new(stderr);
        let mut lines = reader.lines();
        let app_handle = app.clone();
        
        tokio::spawn(async move {
            let mut duration_in_seconds = 0.0;
            
            while let Ok(Some(line)) = lines.next_line().await {
                if duration_in_seconds == 0.0 {
                    if let Some(cap) = regex::Regex::new(r"Duration: (\d{2}):(\d{2}):(\d{2})\.\d{2}")
                        .ok()
                        .and_then(|re| re.captures(&line))
                    {
                        let h: f64 = cap.get(1).and_then(|m| m.as_str().parse().ok()).unwrap_or(0.0);
                        let m: f64 = cap.get(2).and_then(|m| m.as_str().parse().ok()).unwrap_or(0.0);
                        let s: f64 = cap.get(3).and_then(|m| m.as_str().parse().ok()).unwrap_or(0.0);
                        duration_in_seconds = h * 3600.0 + m * 60.0 + s;
                    }
                }
                
                if duration_in_seconds > 0.0 {
                    if let Some(cap) = regex::Regex::new(r"time=(\d{2}):(\d{2}):(\d{2})\.\d{2}")
                        .ok()
                        .and_then(|re| re.captures(&line))
                    {
                        let h: f64 = cap.get(1).and_then(|m| m.as_str().parse().ok()).unwrap_or(0.0);
                        let m: f64 = cap.get(2).and_then(|m| m.as_str().parse().ok()).unwrap_or(0.0);
                        let s: f64 = cap.get(3).and_then(|m| m.as_str().parse().ok()).unwrap_or(0.0);
                        let current_time = h * 3600.0 + m * 60.0 + s;
                        let percent = (current_time / duration_in_seconds * 100.0).min(99.0);
                        
                        let _ = app_handle.emit("encode-progress", serde_json::json!({
                            "percent": percent,
                            "time": format!("{:02}:{:02}:{:02}", (current_time / 3600.0).floor() as u32, ((current_time % 3600.0) / 60.0).floor() as u32, (current_time % 60.0).floor() as u32),
                            "speed": "N/A"
                        }));
                    }
                }
            }
        });
    }
    
    let status = child.wait().await.map_err(|e| format!("FFmpeg process error: {}", e))?;
    
    // Clear process reference
    {
        let mut pid = state.current_pid.lock().await;
        *pid = None;
    }
    {
        let mut output_path = state.current_output_path.lock().await;
        *output_path = None;
    }
    
    let is_cancelling = {
        let cancel = state.is_cancelling.lock().await;
        *cancel
    };
    
    if is_cancelling {
        let mut cancel = state.is_cancelling.lock().await;
        *cancel = false;
        let _ = app.emit("encode-cancelled", ());
        return Ok(());
    }
    
    if status.success() {
        let _ = app.emit("encode-complete", serde_json::json!({ "outputPath": output_path_str }));
    } else {
        let _ = app.emit("encode-error", serde_json::json!({ "message": format!("FFmpeg exited with code {:?}", status.code()) }));
    }
    
    Ok(())
}

#[tauri::command]
async fn trim_video(app: tauri::AppHandle, options: TrimVideoOptions) -> Result<(), String> {
    info!("trim_video called for: {} ({}s - {}s)", options.input, options.start_seconds, options.end_seconds);
    
    let state = app.state::<Arc<AppState>>();
    let ffmpeg_path = get_ffmpeg_path();
    
    let start = options.start_seconds.max(0.0);
    let end = options.end_seconds.max(start + 1.0);
    let duration = end - start;
    
    // Build output path
    let input_path = PathBuf::from(&options.input);
    let stem = input_path.file_stem().map(|s| s.to_string_lossy().to_string()).unwrap_or_default();
    let output_path = if let Some(folder) = &options.output_folder {
        PathBuf::from(folder).join(format!("{}_trimmed.mp4", stem))
    } else {
        input_path.parent().map(|p| p.join(format!("{}_trimmed.mp4", stem))).unwrap_or_else(|| PathBuf::from(format!("{}_trimmed.mp4", stem)))
    };
    let output_path_str = output_path.to_string_lossy().to_string();
    
    let args = vec![
        "-y".to_string(),
        "-ss".to_string(),
        start.to_string(),
        "-i".to_string(),
        options.input.clone(),
        "-t".to_string(),
        duration.to_string(),
        "-c".to_string(),
        "copy".to_string(),
        output_path_str.clone(),
    ];
    
    // Spawn FFmpeg
    let mut child = Command::new(&ffmpeg_path)
        .args(&args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn ffmpeg: {}", e))?;
    
    let child_pid = child.id();
    {
        let mut pid = state.current_pid.lock().await;
        *pid = child_pid;
    }
    {
        let mut output_path = state.current_output_path.lock().await;
        *output_path = Some(output_path_str.clone());
    }
    
    // Read stderr for progress
    if let Some(stderr) = child.stderr.take() {
        let reader = BufReader::new(stderr);
        let mut lines = reader.lines();
        let app_handle = app.clone();
        
        tokio::spawn(async move {
            while let Ok(Some(line)) = lines.next_line().await {
                if let Some(cap) = regex::Regex::new(r"time=(\d+\.?\d*)")
                    .ok()
                    .and_then(|re| re.captures(&line))
                {
                    if let Some(current) = cap.get(1).and_then(|m| m.as_str().parse::<f64>().ok()) {
                        let percent = (current / duration * 100.0).min(99.0);
                        let t = current.floor() as u32;
                        let h = t / 3600;
                        let m = (t % 3600) / 60;
                        let s = t % 60;
                        
                        let _ = app_handle.emit("encode-progress", serde_json::json!({
                            "percent": percent,
                            "time": format!("{:02}:{:02}:{:02}", h, m, s),
                            "speed": "N/A"
                        }));
                    }
                }
            }
        });
    }
    
    let status = child.wait().await.map_err(|e| format!("FFmpeg process error: {}", e))?;
    
    {
        let mut pid = state.current_pid.lock().await;
        *pid = None;
    }
    {
        let mut output_path = state.current_output_path.lock().await;
        *output_path = None;
    }
    
    let is_cancelling = {
        let cancel = state.is_cancelling.lock().await;
        *cancel
    };
    
    if is_cancelling {
        let mut cancel = state.is_cancelling.lock().await;
        *cancel = false;
        let _ = app.emit("encode-cancelled", ());
        return Ok(());
    }
    
    if status.success() {
        let _ = app.emit("encode-complete", serde_json::json!({ "outputPath": output_path_str }));
    } else {
        let _ = app.emit("encode-error", serde_json::json!({ "message": format!("FFmpeg exited with code {:?}", status.code()) }));
    }
    
    Ok(())
}

#[tauri::command]
async fn cancel_encode(app: tauri::AppHandle) -> Result<(), String> {
    info!("cancel_encode called");
    
    let state = app.state::<Arc<AppState>>();
    
    // Set cancelling flag
    {
        let mut cancel = state.is_cancelling.lock().await;
        *cancel = true;
    }
    
    // Kill the process
    let mut pid = state.current_pid.lock().await;
    if let Some(child_pid) = *pid {
        #[cfg(windows)]
        {
            let _ = Command::new("taskkill")
                .args(&["/F", "/T", "/PID", &child_pid.to_string()])
                .output()
                .await;
        }
        #[cfg(not(windows))]
        {
            let _ = Command::new("kill")
                .arg(&child_pid.to_string())
                .output()
                .await;
        }
    }
    
    // Delete incomplete output
    let output_path = {
        let path = state.current_output_path.lock().await;
        path.clone()
    };
    
    if let Some(path_str) = output_path {
        let path = PathBuf::from(&path_str);
        if path.exists() {
            let _ = std::fs::remove_file(&path);
        }
    }
    
    *pid = None;
    
    Ok(())
}

// ============================================================================
// Media Processing Commands
// ============================================================================

#[tauri::command]
async fn get_audio_waveform(file_path: String, mode: Option<String>, width: Option<u32>, height: Option<u32>, palette: Option<String>, palette_color: Option<String>) -> Result<String, String> {
    info!("get_audio_waveform called for: {}", file_path);
    
    let ffmpeg_path = get_ffmpeg_path();
    let w = width.unwrap_or(800);
    let h = height.unwrap_or(120);
    let p = palette.unwrap_or_else(|| "heatmap".to_string());
    let pc = palette_color.unwrap_or_else(|| "63f1af".to_string());
    let m = mode.unwrap_or_else(|| "waveform".to_string());
    
    let filter = if m == "spectrogram" {
        format!("[0:a]showspectrumpic=s={}x{}:legend=0:color=rainbow:scale=log", w, h)
    } else if p == "heatmap" {
        format!("[0:a]aformat=channel_layouts=mono,showwavespic=s={}x{}:colors=white:scale=log,format=gray,r='if(lte(val,128),0,2*(val-128))':g='if(lte(val,128),2*val,255-2*(val-128))':b='if(lte(val,128),255-2*val,0)'", w, h)
    } else if p == "accent" {
        format!("[0:a]aformat=channel_layouts=mono,showwavespic=s={}x{}:colors=0x{}:scale=log", w, h, pc.replace("#", ""))
    } else {
        format!("[0:a]aformat=channel_layouts=mono,showwavespic=s={}x{}:colors=white:scale=log", w, h)
    };
    
    let args = vec![
        "-y".to_string(),
        "-i".to_string(),
        file_path,
        "-filter_complex".to_string(),
        filter,
        "-frames:v".to_string(),
        "1".to_string(),
        "-f".to_string(),
        "image2".to_string(),
        "pipe:1".to_string(),
    ];
    
    let output = new_command(&ffmpeg_path)
        .args(&args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .await
        .map_err(|e| format!("Failed to run ffmpeg: {}", e))?;
    
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        error!("FFmpeg waveform failed: stderr={}, stdout={}", stderr, stdout);
        return Err(format!("FFmpeg failed to generate waveform: {}", stderr));
    }
    
    if output.stdout.is_empty() {
        error!("FFmpeg waveform generated empty output");
        return Err("FFmpeg generated empty waveform output".to_string());
    }
    
    Ok(base64::Engine::encode(&base64::engine::general_purpose::STANDARD, &output.stdout))
}

#[tauri::command]
async fn get_video_thumbnails(file_path: String, duration: f64, count: Option<u32>) -> Result<ThumbnailResult, String> {
    info!("get_video_thumbnails called for: {}", file_path);
    
    let _ffmpeg_path = "ffmpeg".to_string();
    
    // Get file size
    let file_size_mb = std::fs::metadata(&file_path)
        .map(|m| m.len() as f64 / (1024.0 * 1024.0))
        .unwrap_or(0.0);
    
    // Adjust parameters based on file size
    let (target_height, quality, max_count) = if file_size_mb > 600.0 {
        (160, 6, 80)
    } else if file_size_mb > 300.0 {
        (180, 5, 100)
    } else if file_size_mb > 120.0 {
        (200, 4, 140)
    } else if file_size_mb > 40.0 {
        (220, 3, 180)
    } else {
        (240, 2, 300)
    };
    
    let desired_count = count.unwrap_or(50).min(max_count).min(300);
    let fps = (desired_count as f64 + 2.0) / duration;
    let cols = 10;
    let rows = (desired_count as f64 / cols as f64).ceil() as u32;
    
    let tile_layout = format!("{}x{}", cols, rows);
    let vf = format!("fps={},scale=-1:{},tile={}", fps, target_height, tile_layout);
    
    let args = vec![
        "-y".to_string(),
        "-i".to_string(),
        file_path,
        "-vf".to_string(),
        vf,
        "-frames:v".to_string(),
        "1".to_string(),
        "-q:v".to_string(),
        quality.to_string(),
        "-f".to_string(),
        "image2".to_string(),
        "pipe:1".to_string(),
    ];
    
    let ffmpeg_path = get_ffmpeg_path();
    let output = new_command(&ffmpeg_path)
        .args(&args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .await
        .map_err(|e| format!("Failed to run ffmpeg: {}", e))?;
    
    if !output.status.success() {
        return Err("FFmpeg failed to generate thumbnails".to_string());
    }
    
    Ok(ThumbnailResult {
        data: base64::Engine::encode(&base64::engine::general_purpose::STANDARD, &output.stdout),
        count: desired_count,
        cols,
        rows,
        interval: duration / desired_count as f64,
    })
}

// ============================================================================
// Download Commands (yt-dlp)
// ============================================================================

#[tauri::command]
async fn get_video_info(url: String, disable_flat_playlist: Option<bool>) -> Result<VideoInfoResult, String> {
    info!("get_video_info called for: {}", url);
    
    if !validate_url(&url) {
        return Ok(VideoInfoResult {
            is_playlist: false,
            title: None,
            thumbnail: None,
            duration: None,
            channel: None,
            is_video: None,
            formats: None,
            url: Some(url),
            count: None,
            entries: None,
            error: Some("Invalid URL format".to_string()),
        });
    }
    
    let ytdlp_path = get_ytdlp_path();
    
    let mut args = vec![
        "--dump-json".to_string(),
        "--no-download".to_string(),
        "--no-warnings".to_string(),
        "--user-agent".to_string(),
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36".to_string(),
        url.clone(),
    ];
    
    if !disable_flat_playlist.unwrap_or(false) {
        args.push("--flat-playlist".to_string());
    }
    
    let output = Command::new(&ytdlp_path)
        .args(&args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .await
        .map_err(|e| format!("Failed to run yt-dlp: {}", e))?;
    
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Ok(VideoInfoResult {
            is_playlist: false,
            title: None,
            thumbnail: None,
            duration: None,
            channel: None,
            is_video: None,
            formats: None,
            url: Some(url),
            count: None,
            entries: None,
            error: Some(stderr.to_string()),
        });
    }
    
    let stdout = String::from_utf8_lossy(&output.stdout);
    
    // Try to parse JSON
    match serde_json::from_str::<serde_json::Value>(&stdout) {
        Ok(info) => {
            if info.get("_type").and_then(|v| v.as_str()) == Some("playlist") {
                Ok(VideoInfoResult {
                    is_playlist: true,
                    title: info.get("title").and_then(|v| v.as_str()).map(String::from),
                    thumbnail: None,
                    duration: None,
                    channel: None,
                    is_video: None,
                    formats: None,
                    url: Some(url),
                    count: info.get("entries").and_then(|e| e.as_array()).map(|a| a.len() as u32),
                    entries: info.get("entries").and_then(|e| e.as_array()).map(|a| a.clone()),
                    error: None,
                })
            } else {
                let duration_secs = info.get("duration").and_then(|v| v.as_i64());
                let duration_str = duration_secs.map(|d| {
                    let h = d / 3600;
                    let m = (d % 3600) / 60;
                    let s = d % 60;
                    if h > 0 {
                        format!("{}:{:02}:{:02}", h, m, s)
                    } else {
                        format!("{}:{:02}", m, s)
                    }
                });
                
                Ok(VideoInfoResult {
                    is_playlist: false,
                    title: info.get("title").and_then(|v| v.as_str()).map(String::from),
                    thumbnail: info.get("thumbnail").and_then(|v| v.as_str()).map(String::from),
                    duration: duration_str,
                    channel: info.get("uploader").or_else(|| info.get("channel")).and_then(|v| v.as_str()).map(String::from),
                    is_video: info.get("vcodec").and_then(|v| v.as_str()).map(|v| v != "none"),
                    formats: info.get("formats").and_then(|v| v.as_array()).map(|a| a.clone()),
                    url: Some(url),
                    count: None,
                    entries: None,
                    error: None,
                })
            }
        }
        Err(e) => {
            Ok(VideoInfoResult {
                is_playlist: false,
                title: None,
                thumbnail: None,
                duration: None,
                channel: None,
                is_video: None,
                formats: None,
                url: Some(url),
                count: None,
                entries: None,
                error: Some(format!("Failed to parse video info: {}", e)),
            })
        }
    }
}

#[tauri::command]
async fn download_video(app: tauri::AppHandle, url: String, options: DownloadOptions) -> Result<(), String> {
    info!("download_video called for: {}", url);
    
    if !validate_url(&url) {
        return Err("Invalid URL format".to_string());
    }
    
    let state = app.state::<Arc<AppState>>();
    let ytdlp_path = get_ytdlp_path();
    let ffmpeg_path = get_ffmpeg_path();
    
    // Get output folder
    let output_folder = options.output_path.clone().unwrap_or_else(|| {
        dirs::download_dir().unwrap_or_else(|| PathBuf::from(".")).to_string_lossy().to_string()
    });
    
    let mut args = Vec::new();
    
    // Output template
    let output_template = if let Some(ref filename) = options.file_name {
        format!("{}/{}.%(ext)s", output_folder, filename.replace(".", "_"))
    } else {
        format!("{}/%(title)s.%(ext)s", output_folder)
    };
    
    args.push("-o".to_string());
    args.push(output_template);
    
    // FFmpeg location
    if PathBuf::from(&ffmpeg_path).exists() {
        args.push("--ffmpeg-location".to_string());
        args.push(ffmpeg_path.clone());
    }
    
    // Format selection
    if options.mode.as_deref() == Some("audio") {
        args.push("-x".to_string());
        args.push("--audio-format".to_string());
        args.push(options.audio_format.clone().unwrap_or_else(|| "mp3".to_string()));
        
        if let Some(bitrate) = &options.audio_bitrate {
            args.push("--audio-quality".to_string());
            args.push(bitrate.clone());
        }
    } else {
        // Video mode
        if let Some(format) = &options.format {
            match format.as_str() {
                "mp4" => args.push("--merge-output-format".to_string()),
                "mkv" => args.push("--merge-output-format".to_string()),
                "mov" => args.push("--merge-output-format".to_string()),
                "webm" => args.push("--merge-output-format".to_string()),
                _ => {}
            }
            if let Some(f) = args.pop() {
                args.push(f);
            }
        }
        
        // Quality selection
        if let Some(format_id) = &options.format_id {
            if options.mode.as_deref() == Some("video") && !format_id.contains('+') {
                args.push("-f".to_string());
                args.push(format!("{}+bestaudio/best", format_id));
            } else {
                args.push("-f".to_string());
                args.push(format_id.clone());
            }
        } else if options.quality.as_deref() == Some("best") {
            args.push("-f".to_string());
            args.push("bestvideo+bestaudio/best".to_string());
        } else if let Some(quality) = &options.quality {
            args.push("-f".to_string());
            args.push(format!("bestvideo[height<={}]+bestaudio/best[height<={}]/best", quality, quality));
        }
        
        // Post-processing
        let needs_reencode = options.fps.as_ref().map(|f| f != "none").unwrap_or(false)
            || options.video_bitrate.as_ref().map(|b| b != "none").unwrap_or(false)
            || options.video_codec.as_ref().map(|c| c != "copy").unwrap_or(false);
        
        if needs_reencode {
            let mut ffmpeg_args = Vec::new();
            
            if let Some(codec) = &options.video_codec {
                let valid_codecs = ["h264", "h265", "vp9", "av1", "copy"];
                if valid_codecs.contains(&codec.as_str()) {
                    match codec.as_str() {
                        "h264" => ffmpeg_args.extend(["-c:v", "libx264"]),
                        "h265" => ffmpeg_args.extend(["-c:v", "libx265"]),
                        "vp9" => ffmpeg_args.extend(["-c:v", "libvpx-vp9"]),
                        "av1" => ffmpeg_args.extend(["-c:v", "libaom-av1"]),
                        _ => ffmpeg_args.extend(["-c:v", "copy"]),
                    }
                }
            }
            
            if let Some(bitrate) = &options.video_bitrate {
                if bitrate != "none" && regex::Regex::new(r"^\d+[kKmM]$").is_ok() {
                    ffmpeg_args.extend(["-b:v", bitrate]);
                }
            }
            
            if let Some(fps) = &options.fps {
                if fps != "none" {
                    ffmpeg_args.extend(["-r", fps]);
                }
            }
            
            ffmpeg_args.extend(["-c:a", "copy"]);
            
            if !ffmpeg_args.is_empty() {
                args.push("--postprocessor-args".to_string());
                args.push(format!("ffmpeg:{}", ffmpeg_args.join(" ")));
            }
        }
    }
    
    args.push("--progress".to_string());
    args.push("--newline".to_string());
    args.push("--no-cache-dir".to_string());
    args.push("--no-check-certificates".to_string());
    args.push("--force-ipv4".to_string());
    args.push("--force-overwrites".to_string());
    args.push("--postprocessor-args".to_string());
    args.push("ffmpeg:-y".to_string());
    args.push("--user-agent".to_string());
    args.push("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36".to_string());
    args.push(url.clone());
    
    info!("Running yt-dlp with args: {:?}", args);
    
    let mut child = new_command(&ytdlp_path)
        .args(&args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn yt-dlp: {}", e))?;
    
    // Store process reference
    let child_pid = child.id();
    {
        let mut pid = state.current_pid.lock().await;
        *pid = child_pid;
    }
    
    let app_handle = app.clone();
    
    // Read stdout for progress
    if let Some(stdout) = child.stdout.take() {
        let reader = BufReader::new(stdout);
        let mut lines = reader.lines();
        
        tokio::spawn(async move {
            let _current_download_path: Option<String> = None;
            
            while let Ok(Some(line)) = lines.next_line().await {
                let str = line.trim();
                if str.is_empty() {
                    continue;
                }
                
                // Parse progress
                let progress_re = regex::Regex::new(r"\[download\]\s+(\d+\.?\d*)%").unwrap();
                let size_re = regex::Regex::new(r"of\s+~?(\d+\.?\d*[KMG]iB)").unwrap();
                let speed_re = regex::Regex::new(r"at\s+(\d+\.?\d*[KMG]iB/s)").unwrap();
                let eta_re = regex::Regex::new(r"ETA\s+(\d{2}:\d{2})").unwrap();
                
                let dest_re = regex::Regex::new(r"Destination:\s+(.*)").unwrap();
                if let Some(cap) = dest_re.captures(str) {
                    if !cap.get(1).map(|m| m.as_str().contains("...")).unwrap_or(true) {
                        let _ = cap.get(1).map(|m| m.as_str().to_string());
                    }
                }
                
                let mut progress_data = DownloadProgress {
                    percent: None,
                    size: None,
                    speed: None,
                    eta: None,
                    status: None,
                };
                
                if let Some(cap) = progress_re.captures(str) {
                    progress_data.percent = cap.get(1).and_then(|m| m.as_str().parse::<f64>().ok());
                }
                if let Some(cap) = size_re.captures(str) {
                    progress_data.size = cap.get(1).map(|m| m.as_str().to_string());
                }
                if let Some(cap) = speed_re.captures(str) {
                    progress_data.speed = cap.get(1).map(|m| m.as_str().to_string());
                }
                if let Some(cap) = eta_re.captures(str) {
                    progress_data.eta = cap.get(1).map(|m| m.as_str().to_string());
                }
                
                // Status
                let tag_re = regex::Regex::new(r"^\[([^\]]+)\]").unwrap();
                if let Some(cap) = tag_re.captures(str) {
                    let tag = cap.get(1).map(|m| m.as_str()).unwrap_or("");
                    if tag == "Merger" {
                        progress_data.status = Some("Merging formats...".to_string());
                    } else if tag == "ExtractAudio" {
                        progress_data.status = Some("Extracting audio...".to_string());
                    } else if tag == "info" {
                        if str.contains("Downloading webpage") {
                            progress_data.status = Some("Connecting...".to_string());
                        } else if str.contains("Downloading m3u8") {
                            progress_data.status = Some("Preparing stream...".to_string());
                        } else {
                            progress_data.status = Some("Extracting metadata...".to_string());
                        }
                    } else if tag == "download" && progress_data.percent.is_none() {
                        if str.contains("Destination:") {
                            progress_data.status = Some("Creating file...".to_string());
                        }
                    }
                }
                
                if progress_data.percent.is_some() || progress_data.status.is_some() {
                    let _ = app_handle.emit("download-progress", &progress_data);
                }
            }
        });
    }
    
    // Read stderr
    if let Some(stderr) = child.stderr.take() {
        let reader = BufReader::new(stderr);
        let mut lines = reader.lines();
        let app_handle = app.clone();
        
        tokio::spawn(async move {
            while let Ok(Some(line)) = lines.next_line().await {
                let err_str = line.trim();
                if err_str.is_empty() {
                    continue;
                }
                
                if err_str.contains("ERROR:") {
                    let _ = app_handle.emit("download-progress", DownloadProgress {
                        percent: None,
                        size: None,
                        speed: None,
                        eta: None,
                        status: Some(format!("Error: {}", err_str.split("ERROR:").nth(1).map(|s| s.trim()).unwrap_or(err_str))),
                    });
                }
            }
        });
    }
    
    let status = child.wait().await.map_err(|e| format!("yt-dlp process error: {}", e))?;
    
    // Clear process reference
    {
        let mut pid = state.current_pid.lock().await;
        *pid = None;
    }
    
    let is_cancelling = {
        let cancel = state.is_cancelling.lock().await;
        *cancel
    };
    
    if is_cancelling {
        let mut cancel = state.is_cancelling.lock().await;
        *cancel = false;
        let _ = app.emit("download-cancelled", ());
        return Ok(());
    }
    
    if status.success() {
        let _ = app.emit("download-complete", ());
    } else {
        let _ = app.emit("download-error", serde_json::json!({ "message": format!("Download failed with code {:?}", status.code()) }));
    }
    
    Ok(())
}

#[tauri::command]
async fn cancel_download(app: tauri::AppHandle) -> Result<(), String> {
    info!("cancel_download called");
    
    let state = app.state::<Arc<AppState>>();
    
    {
        let mut cancel = state.is_cancelling.lock().await;
        *cancel = true;
    }
    
    let mut pid = state.current_pid.lock().await;
    if let Some(child_pid) = *pid {
        #[cfg(windows)]
        {
            // Use taskkill for Windows to kill process tree
            let _ = new_command("taskkill")
                .args(&["/F", "/T", "/PID", &child_pid.to_string()])
                .output()
                .await;
        }
        #[cfg(not(windows))]
        {
            let _ = Command::new("kill")
                .arg(&child_pid.to_string())
                .output()
                .await;
        }
    }
    
    *pid = None;
    
    Ok(())
}

// ============================================================================
// Shell Commands
// ============================================================================

#[tauri::command]
async fn open_file(file_path: String) -> Result<(), String> {
    info!("open_file called for: {}", file_path);
    
    #[cfg(target_os = "windows")]
    {
        new_command("cmd")
            .args(&["/C", "start", "", &file_path])
            .spawn()
            .map_err(|e| format!("Failed to open file: {}", e))?;
    }
    
    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(&file_path)
            .spawn()
            .map_err(|e| format!("Failed to open file: {}", e))?;
    }
    
    #[cfg(target_os = "linux")]
    {
        Command::new("xdg-open")
            .arg(&file_path)
            .spawn()
            .map_err(|e| format!("Failed to open file: {}", e))?;
    }
    
    Ok(())
}

#[tauri::command]
async fn open_folder(folder_path: String) -> Result<(), String> {
    info!("open_folder called for: {}", folder_path);
    
    #[cfg(target_os = "windows")]
    {
        new_command("explorer")
            .args(&["/select,", &folder_path])
            .spawn()
            .map_err(|e| format!("Failed to open folder: {}", e))?;
    }
    
    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .args(&["-R", &folder_path])
            .spawn()
            .map_err(|e| format!("Failed to open folder: {}", e))?;
    }
    
    #[cfg(target_os = "linux")]
    {
        Command::new("xdg-open")
            .arg(&folder_path)
            .spawn()
            .map_err(|e| format!("Failed to open folder: {}", e))?;
    }
    
    Ok(())
}

#[tauri::command]
async fn open_external(url: String) -> Result<(), String> {
    info!("open_external called for: {}", url);
    
    if !validate_url(&url) {
        return Err("Invalid URL".to_string());
    }
    
    #[cfg(target_os = "windows")]
    {
        new_command("cmd")
            .args(&["/C", "start", "", &url])
            .spawn()
            .map_err(|e| format!("Failed to open URL: {}", e))?;
    }
    
    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(&url)
            .spawn()
            .map_err(|e| format!("Failed to open URL: {}", e))?;
    }
    
    #[cfg(target_os = "linux")]
    {
        Command::new("xdg-open")
            .arg(&url)
            .spawn()
            .map_err(|e| format!("Failed to open URL: {}", e))?;
    }
    
    Ok(())
}

// ============================================================================
// PDF Commands
// ============================================================================

#[tauri::command]
async fn convert_images_to_pdf(image_paths: Vec<String>, output_path: String, _quality: Option<u32>, upscale: Option<bool>) -> Result<String, String> {
    info!("convert_images_to_pdf called with {} images", image_paths.len());
    
    if image_paths.is_empty() {
        return Err("No images provided".to_string());
    }
    
    use printpdf::*;
    
    let (doc, page1, layer1) = PdfDocument::new(
        "output",
        Mm(210.0),
        Mm(297.0),
        "Layer 1",
    );
    
    let current_layer = doc.get_page(page1).get_layer(layer1);
    
    // Get max dimensions if upscaling
    let mut max_width = 0.0;
    let mut max_height = 0.0;
    
    if upscale.unwrap_or(false) {
        for img_path in &image_paths {
            if let Ok(reader) = ImageReader::open(img_path) {
                if let Ok(format) = reader.with_guessed_format() {
                    if let Ok(img) = format.decode() {
                        let (w, h) = img.dimensions();
                        if w as f32 > max_width {
                            max_width = w as f32;
                        }
                        if h as f32 > max_height {
                            max_height = h as f32;
                        }
                    }
                }
            }
        }
        
        if max_width == 0.0 {
            max_width = 612.0;
        }
        if max_height == 0.0 {
            max_height = 792.0;
        }
    }
    
    for (index, img_path) in image_paths.iter().enumerate() {
        let mut reader = ImageReader::open(img_path).map_err(|e| format!("Failed to open image: {}", e))?;
        reader.set_format(ImageFormat::from_path(img_path).unwrap_or(ImageFormat::Jpeg));
        let img = reader.decode().map_err(|e| format!("Failed to decode image: {}", e))?;
        // Convert to RGB8
        let rgb = img.into_rgb8();
        let (w, h) = rgb.dimensions();
        
        let image_x_object = printpdf::ImageXObject {
            width: printpdf::Px(w as usize),
            height: printpdf::Px(h as usize),
            color_space: printpdf::ColorSpace::Rgb,
            bits_per_component: printpdf::ColorBits::Bit8,
            interpolate: true,
            image_data: rgb.into_raw(),
            image_filter: None,
            clipping_bbox: None,
            smask: None,
        };
        
        let image = printpdf::Image::from(image_x_object);

        let page_width = if upscale.unwrap_or(false) { Mm((max_width as f32) / 3.527) } else { Mm((w as f32) / 3.527) };
        let page_height = if upscale.unwrap_or(false) { Mm((max_height as f32) / 3.527) } else { Mm((h as f32) / 3.527) };
        
        if index > 0 {
            let (_new_page, new_layer) = doc.add_page(page_width, page_height, "Layer 1");
            let _ = new_layer; // Use this layer
        }
        
        let mut transform = printpdf::ImageTransform::default();
        if upscale.unwrap_or(false) {
            transform.scale_x = Some(max_width as f32 / w as f32);
            transform.scale_y = Some(max_height as f32 / h as f32);
        }

        image.add_to_layer(
            current_layer.clone(),
            transform,
        );
    }
    
    let file = std::fs::File::create(&output_path).map_err(|e| format!("Failed to create PDF: {}", e))?;
    doc.save(&mut std::io::BufWriter::new(file)).map_err(|e| format!("Failed to save PDF: {}", e))?;
    
    Ok(output_path)
}

// ============================================================================
// Application Entry Point
// ============================================================================

pub fn run() {
    tauri::Builder::default()
        .manage(Arc::new(AppState::default()))
        .plugin(tauri_plugin_log::Builder::new()
            .target(tauri_plugin_log::Target::new(
                tauri_plugin_log::TargetKind::LogDir { file_name: Some("video-toolbox".into()) },
            ))
            .build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_os::init())
        .setup(|_app| {
            info!("Video Toolbox starting up...");
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Dialog commands
            select_file,
            select_files,
            save_file,
            select_folder,
            // Utility commands
            list_files,
            get_app_version,
            // FFmpeg commands
            get_encoders,
            get_metadata,
            get_metadata_full,
            get_image_info,
            save_metadata,
            // Encoding commands
            start_encode,
            extract_audio,
            trim_video,
            cancel_encode,
            // Media processing
            get_audio_waveform,
            get_video_thumbnails,
            // Download commands
            get_video_info,
            download_video,
            cancel_download,
            // Shell commands
            open_file,
            open_folder,
            open_external,
            // PDF commands
            convert_images_to_pdf,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
