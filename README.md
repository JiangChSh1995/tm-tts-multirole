# Multi-Role TTS Player (Official Ver 1.0)

[🇨🇳 中文说明 (Chinese Documentation)](./ZH_README.md)

A powerful Tampermonkey script for Web TTS (Text-to-Speech). Designed specifically for web novels, web-based GALGAMEs, and online dialogue scenarios, it integrates a GAL streaming engine, supports multi-character automatic recognition, emotion tag extraction, and custom TTS backend connections.

> **Credits**: The design concepts for the GAL mode and multi-character emotion features were inspired by **Brain-like Community (类脑社区)** members **cnfh1746_06138** & **kikukiku0662**. Special thanks for their inspiration and creativity.

## ✨ Key Features

* **🎭 Multi-Role & Emotion Recognition**: Automatically parses `【Character Name】` and `〈Emotion Tag〉` from web text and sends them to the backend to generate expressive speech.
* **🚀 GAL Streaming Engine**: Optimized for dialogue scenarios. Supports **Preload** mechanisms—while playing the current sentence, the script automatically generates the next sentences in the background, providing a seamless, game-like experience.
* **🔌 Highly Customizable API**: Supports local TTS deployments (e.g., GPT-SoVITS, VITS) or OpenAI-compatible interfaces.
* **📱 Responsive UI**: Modern floating panel design. Supports dragging on PC and touch on mobile. Includes an "Edge Hide" feature to prevent blocking text while reading.
* **🔊 Audio Fusion (Experimental)**: Supports uploading Reference Audio for voice cloning or mixing (requires backend support).
* **🛡️ Smart Network Management**: Built-in heartbeat detection, timeout retries, request circuit breaking, and a detailed log system.

## 🛠️ Installation & Usage

### 1. Prerequisites
* Install the browser extension [Tampermonkey](https://www.tampermonkey.net/).
* Have a working TTS backend API (Recommended: Local GPT-SoVITS API).

### 2. Quick Start
1.  Install this script.
2.  Open any webpage; you will see the **TTS Floating Panel** on the right.
3.  Click the **⚙️ Settings** icon and configure your `TTS API URL`.
4.  Click the **▶ Play** button. The script will parse the current page's dialogue and begin reading.

---

## ⚙️ Configuration Guide

### API Connection Settings
In the settings panel, configure the following parameters to connect to your TTS service:

* **API URL**: Default is `http://127.0.0.1:8000` (Modify according to your actual setup).
* **Authentication**: Supports `None`, `Bearer Token`, `API Key`, and Custom Prefix.
* **Request Body (JSON)**:
    The script defaults to a GPT-SoVITS compatible format. If using an OpenAI format, ensure the `model` field is included.
    * **Variable Substitution**: You can use `"savedRefAudioBase64"` and `"promptText"` placeholders in the JSON config. The script will automatically replace them with your uploaded reference audio and text at runtime.

### Playback Modes
* **Stream (Basic)**: Generates and plays sentence by sentence. Suitable for standard long texts.
* **GAL Stream (Advanced)**: The core feature. The script extracts all dialogue on the page at once and builds a playback queue. When playing sentence *N*, it automatically preloads *N+1* and *N+2* in the background, significantly reducing wait times.

---

## 📝 Text Recognition & Regex Requirements (Core)

The core strength of this script is its ability to recognize specific text formats. You can switch between different **"Detection Modes"** in the settings. Below are the detailed requirements for each mode:

### 1. 【Character】〈Emotion〉「Dialogue」 (Default & Recommended)
The most precise mode, suitable for standard scripts or GAL text formats.
* **Regex Logic**: Looks for `【Name】` + Optional `〈Emotion〉` + `「Dialogue」`.
* **Example**:
    ```text
    【Alice】〈Happy〉「The weather is so nice today!」
    【Demon King】「Hmph, what a boring day.」
    ```
* **Result**: Character, Emotion, and Text are all extracted and sent to the TTS engine.

### 2. 〈Emotion〉「Dialogue」
Suitable for monologues or scenes where character names are not explicitly tagged but emotions are.
* **Example**:
    ```text
    〈Sad〉「Why did it turn out like this...」
    ```

### 3. Narration & Dialogue
A hybrid mode that recognizes both dialogue inside quotes and narration text outside quotes.
* **Note**: Narration usually lacks character/emotion tags and will be read using the default voice configuration.

### 4. Quotation Style Support
The script supports automatic matching for three quotation styles. Please select the one matching your webpage in Settings:
* **Japanese**: `「 ... 」`
* **Chinese**: `“ ... ”`
* **Western**: `" ... "`

> **Note**: Only text matching the selected Regex rules will be sent to the TTS engine. If there is no sound after clicking Play, please click the **🔍 (Detect)** button on the panel to verify if the script is successfully recognizing the text.

---

## 🎨 Character Management System

The script features a dynamic character management system:

1.  **Auto-Capture**: When a new `【Character Name】` is detected, it is automatica
