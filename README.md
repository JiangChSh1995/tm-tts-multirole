# 📖 Web TTS (GAL Engine Edition)  User Guide

[🇨🇳 中文说明 (Chinese Documentation)](./ZH_README.md)

A powerful browser-based TTS (Text-to-Speech) Tampermonkey script. It is specifically designed for web novels, browser-based GALGAMEs (Girl/Game), and online dialogue scenarios, integrating a GAL Streaming Engine, supporting multi-role auto-recognition, emotion tag extraction, and dual custom TTS backend integration (OpenAI/GPT-SoVITS).

> **Credits**: The GAL mode and multi-role emotion design concepts for this project are inspired by **cnfh1746_06138** and **kikukiku0662** from the **Brain-like Community**. Special thanks for the inspiration and creativity.

---

## ✨ Core Features (v1.2 Update)

* **🎭 Multi-Role and Emotion Recognition**: Automatically parses `【Role Name】` and `〈Emotion Tag〉` from web text, sending them to the backend to generate emotional speech.
    * *v1.2 Update*: Supports converting metadata into natural language instructions (Prompt) for injection into OpenAI-formatted models.
* **🚀 GAL Streaming Engine**: Optimized for dialogue scenarios. Supports a **Preload mechanism** where the script automatically generates subsequent audio in the background while the current sentence is playing, providing a seamless, game-like reading experience with minimal waiting time.
* **🧠 Intelligent Dual-Engine Support**:
    * **OpenAI Mode**: Compatible with GPT-4o-Audio, CosyVoice, and other models that support the standard OpenAI format.
    * **GPT-SoVITS Mode**: Compatible with standard inference backends like VITS and GPT-SoVITS.
* **💉 Smart Reference Injection (Experimental)**:
    * Supports uploading a **Reference Audio** (Ref Audio) for cloning or vocal fusion.
    * Automatically determines whether to send Base64 data or FormData based on configuration, eliminating the need for manual code switching.
* **📱 Dual-Platform Adapted UI**: A modern floating panel design that supports drag-and-drop on PC and touch control on mobile, featuring an "Edge Hide" function to keep the reading view clear.
* **🛡️ Privacy and Network Management**:
    * **Sensitive Information Masking**: API addresses/Tokens are masked by default (e.g., `********a1b2`) to prevent accidental leaks.
    * Built-in heartbeat detection, timeout retry, request circuit breaker mechanisms, and a detailed logging system.

---

## 🛠️ Installation & Usage

### 1. Environment Setup
* Install the browser extension [Tampermonkey](https://www.tampermonkey.net/).
* Have a usable TTS backend API (recommended: a locally deployed GPT-SoVITS API or a cloud API compatible with the OpenAI format).

### 2. Quick Start
1.  Install the script.
2.  Open any webpage; you will see the floating **TTS Panel** on the right side.
3.  Click the **⚙️ Settings** icon and configure your `TTS API Address` and JSON parameters.
4.  Click the **▶ Play** button. The script will automatically parse the dialogue on the current page and begin reading aloud.

---

## ⚙️ Detailed Configuration Guide (Core)

### 🔌 API Connection Settings
In the settings panel, you need to configure the following parameters:

* **API Address**: Defaults to `http://127.0.0.1:8000`. (Modify as necessary).
* **Authentication Method**: Supports `None`, `Bearer Token`, `API Key`, and custom prefix.

### 📝 JSON Request Body Configuration (v1.2)
⚠️ **IMPORTANT**: The script uses the `api_type` field to intelligently identify the backend. Please select the appropriate template below. **It is recommended to place `api_type` on the first line of the JSON.**

#### 🟢 Mode A: OpenAI Compatible Format
Suitable for official OpenAI endpoints or compatible third-party backends.

```json
{
  "api_type": "openai",
  "model": "gpt-4o-audio-preview",
  "voice": "alloy",
  "response_format": "wav",
  "references": [
    {
      "audio": "savedRefAudioBase64",
      "text": "promptText"
    }
  ]
}
```

* **Smart Injection**: `"savedRefAudioBase64"` and `"promptText"` are placeholder strings. When this structure is present, the script automatically replaces them with the Base64 of the uploaded audio and the reference text, respectively.
* **No Cloning Needed**: If you do not require the cloning function, you can delete the entire `references` array.

#### 🔵 Mode B: GPT-SoVITS Format
Suitable for standard GPT-SoVITS inference backends.

```json
{
  "api_type": "gpt-sovits",
  "speed_facter": 1.0,
  "volume": 1.0,
  "top_k": 10,
  "top_p": 1.0,
  "temperature": 1.0,
  "emotion": "default"
}
```

* **Cloning/Fusion**: In this mode, it is **not** recommended to include `refer_wav` or `prompt_text` fields in the JSON.
* **Operation**: To enable cloning, simply check the **"Enable Vocal Fusion Mode"** checkbox on the script's UI panel and upload the file. The script will automatically switch to sending the request via FormData.

### ⏯️ Playback Modes
* **Basic Streaming Playback**: Generates and plays sentence by sentence, suitable for general long texts.
* **GAL Streaming Playback**: The core feature. The script extracts all dialogue on the page at once and builds a playback queue. When playing the Nth sentence, it automatically preloads the N+1 and N+2 sentences in the background, significantly reducing waiting time.

---

## 📝 Text Recognition and Regular Expression Requirements (Core)

The script's core functionality relies on recognizing the text format. You can switch the regular expression matching logic by selecting the **"Recognition Mode"** in the settings.

### 1. 【Role】〈Emotion〉「Dialogue」 (Recommended Default)
The most precise mode, suitable for standard script or GAL text formats.
* **Regex Logic**: Looks for `【Role Name】` + optional `〈Emotion〉` + `「Dialogue Content」`.
* **Example**:
    ```text
    【Alice】〈Happy〉「The weather is lovely today!」
    【Demon Lord】「Hmph, what a boring day.」
    ```
* **Parsing Result**: Role, emotion, and text are all extracted and sent to the TTS engine.

### 2. 〈Emotion〉「Dialogue」
Suitable for single-person monologues or scenes where the role name is omitted but emotion is marked.
* **Example**: `〈Sad〉「Why did things turn out this way...」`

### 3. Narration and Dialogue
A mixed mode that recognizes both dialogue in quotes and narration text outside of them.
* **Note**: Narration usually does not have role/emotion enhancements and will be read using the default voice.

### 4. Quotation Style Support
The script supports automatic matching for three quotation styles; please select the one used on the webpage:
* **Japanese**: `「 ... 」`
* **Chinese**: `“ ... ”`
* **Western**: `" ... "`

> **Note**: Only text conforming to the selected regex rules will be sent to the TTS engine. If you click play and hear no sound, please click the **🔍 (Detect)** button on the control panel first to confirm the script successfully recognized text.

---

## 🎨 Role Management System

The script features a dynamic role management function:

1.  **Automatic Capture**: When the script recognizes a new `【Role Name】`, it automatically adds it to the "Detected Roles Pool."
2.  **Independent Configuration**: Click the ⚙️ button next to a role to set **Speed** and other parameters specifically for that character.
3.  **Group Management**: You can create custom groups (e.g., "Protagonist Team," "Villains") and assign colors to different groups for easier differentiation in logs and debugging.

---

## ❓ Frequently Asked Questions (FAQ)

**Q: Why is the API Address/Key input masked with asterisks?**
A: This is the v1.2 privacy protection feature. The value is displayed as masked (e.g., `********a1b2`) when unchanged. The actual value is only restored when you click to edit, preventing leakage during streaming or screenshots.

**Q: Why is there no response after clicking play?**
A: Please check the following steps:
1.  Go to **⚙️ Settings -> Network Diagnosis** and test if the API is connected.
2.  Click the **🔍 Detect** button on the main panel to confirm that the current page's text format matches your regex settings.
3.  Check the **📋 Log** for any red error messages.

**Q: The website is not in the whitelist?**
A: For security and performance, the script does not run on all websites by default. The first time you use it on a new site, go to **Settings -> 🌐 Whitelist -> Add Current Website**.

**Q: How do I hide the panel on mobile devices?**
A: Click the **👁** icon on the panel. The panel will collapse to the edge of the screen, leaving only a small corner marker. Tap the marker to restore it.

---

## Copyright Notice & User Guidelines

### Copyright Statement (Original Chinese Text Governs)

1.  **The complete copyright of this script (including code, logic architecture, and functional design) belongs to JChSh (Bilibili UID: 511242)**, and is protected by the *Copyright Law of the People's Republic of China* and the *Berne Convention for the Protection of Literary and Artistic Works*, as well as other relevant international conventions.
2.  **Without prior written permission from the copyright holder, no organization or individual may use this script for commercial purposes** (including but not limited to selling, renting, advertising insertion, or linking to commercial services for the purpose of profit). Any unauthorized commercial use shall be held legally liable, and all resulting profits shall belong to the copyright holder. The infringing party shall bear all legal responsibilities independently.
3.  **Non-commercial derivative works must meet the following conditions**:
    * ① Contact the copyright holder JChSh through legal channels and obtain written permission beforehand;
    * ② Prominently and completely mark the copyright and acknowledgment information in the derivative work. The required attribution text is: "**This work is based on the script created by JChSh (Bilibili UID: 511242), with special thanks for the GAL mode and multi-role emotion concept inspiration to cnfh1746_06138 & kikukiku0662 of the Brain-like Community**";
    * ③ The original copyright statement and acknowledgment information must not be modified or deleted.
4.  It is strictly forbidden to use this script for illegal activities, infringement of others' legitimate rights and interests, or any behavior that violates laws and public order and good customs. Otherwise, the user shall bear all legal responsibilities themselves.

### User Guidelines (Original Chinese Text Governs)

1.  You are only granted non-commercial usage rights for this script and have no right to transfer, authorize others to use, or engage in any form of commercial utilization.
2.  To create non-commercial derivative works, you must contact the copyright holder JChSh in advance and obtain written permission. Derivative work created without permission is considered infringement.
3.  Derivative works must strictly adhere to the attribution requirements in the Copyright Statement, ensuring the acknowledgment information is complete, clearly visible, and not arbitrarily modified or omitted.
4.  You shall bear all related risks arising from the use of this script. The copyright holder makes no explicit or implicit warranties regarding the script's compatibility, stability, or usage effect.
5.  The copyright holder reserves the right to pursue legal responsibility for any violation of this Copyright Statement and User Guidelines, including but not limited to demanding cessation of infringement, compensation for damages, and public apology.

### Other Notes

* This agreement is governed by the laws of the People's Republic of China and relevant international copyright laws. Dispute resolution will be prioritized through negotiation; if negotiation fails, disputes shall be under the jurisdiction of the People's Court at the location of the copyright holder's domicile.
