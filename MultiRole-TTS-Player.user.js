// ==UserScript==
// @name         多角色TTS播放器
// @namespace    http://tampermonkey.net/
// @version      1.1
// @description  网页通用TTS播放器，集成GAL游戏流式语音引擎，支持多角色与情绪自动识别、自定义API连接、自动播放及移动端UI适配。(v1.1 双端UI修复)（GAL模式与多角色情感思路致谢：类脑社区 cnfh1746_06138 & kikukiku0662）
// @author       JChSh (Bilibili UID: 511242)
// @match        *://*/*
// @connect      *
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addStyle
// @grant        GM_info
// @license      All Rights Reserved
// @updateURL    https://raw.githubusercontent.com/JiangChSh1995/tm-tts-multirole/refs/heads/main/MultiRole-TTS-Player.user.js
// @downloadURL  https://raw.githubusercontent.com/JiangChSh1995/tm-tts-multirole/refs/heads/main/MultiRole-TTS-Player.user.js
// ==/UserScript==

/*
 * =============================
 * COPYRIGHT NOTICE & USER GUIDELINES
 * =============================
 *
 * Copyright Notice (English)
 * --------------------------
 * 1. All rights to this script (including but not limited to code, logical architecture, and functional design) are exclusively owned by JChSh (Bilibili UID: 511242). This work is protected by the Copyright Law of the People's Republic of China and relevant international conventions.
 * 2. Without the prior written permission of the copyright owner, no organization or individual may use this script for commercial purposes. Commercial use includes sale, rental, advertising insertion, and association with commercial services.
 * 3. Non-commercial derivative works are permitted only if:
 * - You have obtained written permission from JChSh.
 * - You clearly credit the source: "This work is based on the script created by JChSh (Bilibili UID: 511242). Special thanks to Brain-like Community members cnfh1746_06138 & kikukiku0662 for the GAL mode and multi-character emotional design ideas."
 * - The original copyright notice is not modified or deleted.
 * 4. It is strictly prohibited to use this script for illegal activities.
 *
 * 版权声明 (中文)
 * -----------------
 * 1. 本脚本（含代码、逻辑架构、功能设计）的完整版权归 JChSh（Bilibili UID：511242） 所有，受《中华人民共和国著作权法》等法律保护。
 * 2. 未经版权人事先书面许可，严禁任何形式的商业化用途（包括但不限于售卖、出租、植入广告等）。商业侵权产生的一切收益归版权人所有，侵权方需承担法律责任。
 * 3. 非商业化二创需满足：① 获得 JChSh 书面许可；② 在显著位置标注：“本作品基于 JChSh（Bilibili UID：511242）的脚本创作，GAL模式与多角色情感思路特别致谢 类脑社区 cnfh1746_06138 & kikukiku0662”；③ 保留原版权声明。
 * 4. 严禁利用本脚本从事违法犯罪行为，使用者需自行承担法律责任。
 *
 * User Guidelines
 * ---------------
 * 1. You are granted only the right to use this script for non-commercial purposes.
 * 2. You shall bear all risks associated with the use of this script. The copyright owner makes no warranties regarding compatibility or stability.
 * 3. The copyright owner reserves the right to pursue legal action against any violation.
 *For the full Copyright Notice & User Guidelines, please visit: https://github.com/JiangChSh1995/tm-tts-multirole
 *
 * 用户须知
 * --------
 * 1. 您仅获得本脚本的非商业性使用权限，无权转让或商业化利用。
 * 2. 您应自行承担使用本脚本的风险，版权人不对稳定性做担保。
 * 3. 对于违反本声明的行为，版权人保留追究法律责任的权利。
 * 4.完整版用户须知以及版权声明请访问: https://github.com/JiangChSh1995/tm-tts-multirole
 *
 * =============================
 */

(function() {
    'use strict';

    // 模块：全局变量定义与配置初始化
    let ttsApiUrl = GM_getValue('ttsApiUrl', 'http://127.0.0.1:8000');
    let authToken = GM_getValue('authToken', '');
    let authType = GM_getValue('authType', authToken ? 'bearer' : 'none');
    let authCustomPrefix = GM_getValue('authCustomPrefix', '');
    let ttsFetchTimeout = GM_getValue('ttsFetchTimeout', 60000);
    let ttsGenTimeout = GM_getValue('ttsGenTimeout', 180000);
    let customDataJson = GM_getValue('customDataJson', '{\n  "speed_facter": 1.0,\n  "volume": 1.0,\n  "top_k": 10,\n  "top_p": 1.0,\n  "temperature": 1.0\n}');
    let mergeAudioEnabled = GM_getValue('mergeAudioEnabled', false);
    let refAudioPath = GM_getValue('refAudioPath', '');
    let promptText = GM_getValue('promptText', '');
    let savedRefAudioBase64 = GM_getValue('savedRefAudioBase64', null);
    let refAudioFile = null;
    let playbackMode = GM_getValue('playbackMode', 'stream');
    let autoPlayEnabled = GM_getValue('autoPlayEnabled', false);
    let edgeMode = GM_getValue('edgeMode', false);
    let detectionMode = GM_getValue('detectionMode', 'character_and_dialogue');
    let quotationStyle = GM_getValue('quotationStyle', 'japanese');
    let characterVoices = GM_getValue('characterVoicesOnline', {});
    let characterGroups = GM_getValue('characterGroupsOnline', {});
    let allDetectedCharacters = new Set(GM_getValue('allDetectedCharactersOnline', []));
    let floatPanelPos = GM_getValue('floatPanelPos', {
        top: '20%',
        right: '20px'
    });
    let settingsPanelPos = GM_getValue('settingsPanelPos', {
        top: '50%',
        left: '50%'
    });
    let isPlaying = false;
    let isPaused = false;
    let isGenerating = false;
    let generationQueue = [];
    let playbackQueue = [];
    let sessionAudioCache = [];
    let currentAudio = null;
    let lastProcessedMessageId = null;
    let lastMessageParts = [];
    let autoPlayTimer = null;
    let isEdgeHidden = false;
    let originalPosition = null;
    let edgeIndicatorLastTop = null;
    let logStore = [];
    const URL_WHITELIST_KEY = 'tts_url_whitelist';

    // 模块：日志与通知系统
    function addLog(type, message, details = null) {
        const entry = {
            id: Date.now() + Math.random(),
            timestamp: new Date().toLocaleTimeString(),
            type: type,
            message: message,
            details: details
        };
        logStore.push(entry);
        if (logStore.length > 100) logStore.shift();
    }

    function initConsoleLogger() {
        const methods = ['log', 'warn', 'error', 'info'];
        methods.forEach(method => {
            const original = console[method];
            console[method] = function(...args) {
                original.apply(console, args);
                const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
                let type = 'sys';
                if (msg.includes('[TTS]')) type = 'sys';
                else if (method === 'error') type = 'err';
                else if (method === 'warn') type = 'warn';
                addLog(type, msg);
            };
        });
    }

    function showNotification(message, type = 'info', duration = 3000) {
        let container = document.getElementById('tts-notification-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'tts-notification-container';
            document.body.appendChild(container);
        }
        const notif = document.createElement('div');
        notif.className = `tts-notification ${type}`;
        notif.textContent = message;
        container.appendChild(notif);
        setTimeout(() => notif.classList.add('show'), 100);
        setTimeout(() => {
            notif.classList.remove('show');
            setTimeout(() => notif.remove(), 300);
        }, duration);
    }

    // 模块：工具函数（语言检测、文件处理与白名单）
    function detectLanguage(text) {
        if (!text) return 'zh';
        if (/^[\u4e00-\u9fa5\u3000-\u303f\uff00-\uffef\s]+$/.test(text)) return 'zh';
        if (/^[a-zA-Z\s.,?!'"-]+$/.test(text)) return 'en';
        if (/^[\u3040-\u30ff\u31f0-\u31ff\uff66-\uff9f\u4e00-\u9fa5\s]+$/.test(text) && /[ぁ-んァ-ヶ]/.test(text)) return 'ja';
        if (/^[\uac00-\ud7af\u1100-\u11ff\u3130-\u318f\s]+$/.test(text)) return 'ko';
        return 'zh';
    }

    const b64toFile = (b64Data, filename) => {
        if (!b64Data || typeof b64Data !== 'string') return null;
        try {
            const arr = b64Data.split(',');
            if (arr.length < 2) return null;
            const mimeMatch = arr[0].match(/:(.*?);/);
            const mime = mimeMatch ? mimeMatch[1] : 'audio/wav';
            const bstr = atob(arr[1]);
            let n = bstr.length;
            const u8arr = new Uint8Array(n);
            while (n--) u8arr[n] = bstr.charCodeAt(n);
            return new File([u8arr], filename, {
                type: mime
            });
        } catch (e) {
            console.error("恢复音频文件失败", e);
            return null;
        }
    };

    if (savedRefAudioBase64 && refAudioPath) {
        refAudioFile = b64toFile(savedRefAudioBase64, refAudioPath);
        if (refAudioFile) addLog('sys', `成功恢复参考音频: ${refAudioPath}`);
    }

    function isCurrentUrlWhitelisted() {
        const whitelist = GM_getValue(URL_WHITELIST_KEY, []);
        if (!Array.isArray(whitelist) || whitelist.length === 0) return true;
        const currentUrl = window.location.href;
        const currentHost = window.location.host;
        return whitelist.some(url => {
            try {
                return new URL(url).host === currentHost || url === currentUrl;
            } catch {
                return url === currentHost || url === currentUrl;
            }
        });
    }

    function getCurrentQuotePair() {
        if (quotationStyle === 'western') return ['"', '"'];
        if (quotationStyle === 'chinese') return ['“', '”'];
        return ['「', '」'];
    }

    // 模块：网络请求封装
    async function makeRequest(url, options = {}) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: options.method || "POST",
                url: url,
                headers: options.headers || {},
                data: options.data,
                responseType: options.responseType,
                timeout: options.timeout || ttsFetchTimeout,
                onload: (res) => {
                    resolve(res);
                },
                onerror: (err) => {
                    addLog('net', `网络层错误`, {
                        error: err
                    });
                    reject(err);
                },
                ontimeout: () => {
                    addLog('net', `请求超时`, {
                        url: url,
                        timeout: options.timeout || ttsFetchTimeout
                    });
                    reject(new Error("Timeout"));
                }
            });
        });
    }

    // 模块：音频生成核心逻辑
    async function generateAudio(task) {
        const lang = detectLanguage(task.dialogue);
        let requestPayload = {};
        try {
            requestPayload = JSON.parse(customDataJson);
        } catch (e) {}

        const isOpenAI = requestPayload.model || requestPayload.api_type === 'openai';

        if (isOpenAI) {
            requestPayload.input = task.dialogue;
            delete requestPayload.text;
            delete requestPayload.text_lang;
            delete requestPayload.api_type;

            if (task.character && characterVoices[task.character] && characterVoices[task.character].speed) {
                requestPayload.speed = characterVoices[task.character].speed;
            }

            if (requestPayload.references && Array.isArray(requestPayload.references)) {
                requestPayload.references.forEach(ref => {
                    if (ref.audio === "savedRefAudioBase64") {
                        if (savedRefAudioBase64) {
                            ref.audio = savedRefAudioBase64;
                            addLog('sys', '已将 savedRefAudioBase64 变量替换为实际音频数据');
                        } else {
                            addLog('warn', 'JSON配置引用了 savedRefAudioBase64，但当前未上传参考音频');
                        }
                    }
                    if (ref.text === "promptText") {
                        if (promptText) {
                            ref.text = promptText;
                        } else {
                            addLog('warn', 'JSON配置引用了 promptText，但当前未填写参考文本');
                        }
                    }
                });
            }

            const headers = {
                "Content-Type": "application/json"
            };
            if (authToken && authToken.trim() !== "") {
                headers["Authorization"] = `Bearer ${authToken}`;
            }

            const finalData = JSON.stringify(requestPayload);
            const retryInterval = 10000;
            const maxDuration = Math.max(ttsFetchTimeout, ttsGenTimeout);
            const maxRetries = Math.ceil(maxDuration / retryInterval);

            for (let attempt = 1; attempt <= maxRetries; attempt++) {
                if (!isPlaying && !GalStreamingPlayer.isActive) {
                    throw new Error("ABORT_BY_USER");
                }
                try {
                    if (attempt > 1) addLog('warn', `[重试] 第 ${attempt}/${maxRetries} 次尝试...`);
                    const response = await makeRequest(ttsApiUrl, {
                        method: "POST",
                        headers: headers,
                        data: finalData,
                        timeout: ttsGenTimeout,
                        responseType: 'blob'
                    });

                    if (response.status >= 400) {
                        let errorText = "Client Error";
                        try {
                            errorText = await response.response.text();
                        } catch (e) {}
                        addLog('err', `API请求拒绝 (Status: ${response.status})`, {
                            response: errorText
                        });
                        throw new Error("FATAL_CLIENT_ERROR");
                    }

                    const blob = response.response;
                    if (!(blob instanceof Blob)) {
                        throw new Error("INVALID_RESPONSE_TYPE");
                    }

                    const audioUrl = URL.createObjectURL(blob);
                    addLog('net', `API 生成成功 (Binary)`, {
                        size: blob.size,
                        audioUrl: audioUrl
                    });

                    return {
                        url: audioUrl,
                        task: task
                    };

                } catch (error) {
                    const fatalErrors = ["FATAL_CLIENT_ERROR", "ABORT_BY_USER"];
                    if (fatalErrors.includes(error.message) || attempt === maxRetries) {
                        console.error(`[TTS] 终止请求: ${error.message}`);
                        throw error;
                    }
                    addLog('net', `请求异常: ${error.message || "Network Error"}。10秒后重试...`);
                    await new Promise(resolve => setTimeout(resolve, retryInterval));
                }
            }
        } else {
            if (task.character && characterVoices[task.character] && typeof characterVoices[task.character] === 'object') {
                const charConfig = characterVoices[task.character];
                if (charConfig.speed) requestPayload.speed_facter = charConfig.speed;
            }

            if (task.emotion && task.emotion.trim() !== '') {
                requestPayload.emotion = task.emotion.trim();
                addLog('sys', `检测到情绪 [${task.emotion.trim()}]，已添加到请求体`);
            }

            let headers = {};
            if (authToken && authToken.trim() !== "") {
                if (authType === 'bearer') headers["Authorization"] = `Bearer ${authToken}`;
                else if (authType === 'api') headers["Authorization"] = `api ${authToken}`;
                else if (authType === 'custom') headers["Authorization"] = `${authCustomPrefix} ${authToken}`.trim();
            }

            let finalData;
            if (mergeAudioEnabled) {
                if (!refAudioFile || !(refAudioFile instanceof File)) {
                    if (savedRefAudioBase64) refAudioFile = b64toFile(savedRefAudioBase64, refAudioPath);
                    if (!refAudioFile) {
                        showNotification('⚠️ 参考音频丢失', 'error');
                        throw new Error("参考音频文件无效");
                    }
                }
                finalData = new FormData();
                finalData.append('text', task.dialogue);
                finalData.append('text_lang', lang);
                finalData.append('refer_wav', refAudioFile);
                finalData.append('prompt_text', promptText);
                finalData.append('prompt_text_lang', detectLanguage(promptText));
                for (const [key, value] of Object.entries(requestPayload)) {
                    finalData.append(key, typeof value === 'object' ? JSON.stringify(value) : value);
                }
            } else {
                requestPayload.text = task.dialogue;
                requestPayload.text_lang = lang;
                finalData = JSON.stringify(requestPayload);
                headers["Content-Type"] = "application/json";
            }

            const retryInterval = 10000;
            const maxDuration = Math.max(ttsFetchTimeout, ttsGenTimeout);
            const maxRetries = Math.ceil(maxDuration / retryInterval);

            for (let attempt = 1; attempt <= maxRetries; attempt++) {
                if (!isPlaying && !GalStreamingPlayer.isActive) {
                    throw new Error("ABORT_BY_USER");
                }

                try {
                    if (attempt > 1) addLog('warn', `[重试] 第 ${attempt}/${maxRetries} 次尝试...`);

                    const response = await makeRequest(ttsApiUrl, {
                        method: "POST",
                        headers: headers,
                        data: finalData,
                        timeout: ttsGenTimeout
                    });

                    if (response.status >= 400 && response.status < 500) {
                        const errMsg = `请求被拒绝 (Status: ${response.status})`;
                        addLog('err', errMsg, {
                            status: response.status,
                            responseText: response.responseText.length > 200 ? 'Response too long/HTML' : response.responseText
                        });
                        throw new Error("FATAL_CLIENT_ERROR");
                    }

                    let audioUrl;
                    try {
                        const json = JSON.parse(response.responseText);
                        if (json.detail || json.error) {
                            addLog('err', `API返回业务错误`, {
                                error: json
                            });
                            throw new Error("API_BUSINESS_ERROR");
                        }
                        audioUrl = json.audio_url || json.url;
                        if (!audioUrl) {
                            addLog('err', `JSON缺少 audio_url 字段`, {
                                json: json
                            });
                            throw new Error("INVALID_JSON_STRUCTURE");
                        }
                        addLog('net', `API 返回成功`, {
                            status: response.status,
                            audioUrl: audioUrl
                        });
                    } catch (jsonErr) {
                        if (jsonErr.message === "API_BUSINESS_ERROR" || jsonErr.message === "INVALID_JSON_STRUCTURE") {
                            throw new Error("FATAL_JSON_ERROR");
                        }
                        addLog('net', `JSON 解析失败 (可能非 JSON 响应)`, {
                            responseText: response.responseText.substring(0, 100)
                        });
                        throw new Error("JSON_PARSE_FAILED");
                    }

                    return {
                        url: audioUrl,
                        task: task
                    };

                } catch (error) {
                    const fatalErrors = ["FATAL_CLIENT_ERROR", "FATAL_JSON_ERROR", "ABORT_BY_USER"];
                    if (fatalErrors.includes(error.message) || attempt === maxRetries) {
                        console.error(`[TTS] 终止请求: ${error.message}`);
                        throw error;
                    }
                    addLog('net', `请求异常: ${error.message || "Network Error"} (Status: ${error.status || 'Unknown'})。10秒后重试...`);
                    await new Promise(resolve => setTimeout(resolve, retryInterval));
                }
            }
        }
    }

    function fetchAudioBlob(url) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url: url,
                responseType: 'blob',
                timeout: ttsFetchTimeout,
                onload: (res) => res.status === 200 ? resolve(URL.createObjectURL(res.response)) : reject(new Error(res.statusText)),
                onerror: reject,
                ontimeout: () => reject(new Error("Audio Download Timeout"))
            });
        });
    }

    // 模块：音频播放管理（含GAL流式引擎）
    function playAudioPromise(blobUrl) {
        return new Promise((resolve, reject) => {
            let audioPlayer = document.getElementById('tts-audio-player');
            if (!audioPlayer) {
                audioPlayer = document.createElement('audio');
                audioPlayer.id = 'tts-audio-player';
                audioPlayer.style.display = 'none';
                document.body.appendChild(audioPlayer);
            }
            currentAudio = audioPlayer;

            const onEnded = () => {
                cleanup();
                resolve();
            };
            const onError = (e) => {
                cleanup();
                if (audioPlayer.src) reject(new Error("音频播放失败"));
                else resolve();
            };
            const cleanup = () => {
                audioPlayer.removeEventListener('ended', onEnded);
                audioPlayer.removeEventListener('error', onError);
            };

            audioPlayer.addEventListener('ended', onEnded);
            audioPlayer.addEventListener('error', onError);

            audioPlayer.src = blobUrl;
            audioPlayer.play().catch(e => {
                console.error("Play failed", e);
                onError(e);
            });
        });
    }

    const GalStreamingPlayer = {
        isActive: false,
        currentSegments: [],
        currentIndex: 0,
        audioCache: new Map(),
        config: {
            preloadCount: 3,
        },
        async initialize(galDialogues) {
            if (!galDialogues || galDialogues.length === 0) return false;
            this.isActive = true;
            this.currentSegments = galDialogues;
            this.currentIndex = 0;
            this.audioCache.clear();
            addLog('sys', `[GAL] 初始化: ${galDialogues.length} 个片段`);
            this.preloadSegments(0, this.config.preloadCount);
            return true;
        },
        async preloadSegments(startIndex, count) {
            if (!this.isActive) return;
            for (let i = startIndex; i < Math.min(startIndex + count, this.currentSegments.length); i++) {
                if (!this.audioCache.has(i)) {
                    this.generateSegmentAudio(this.currentSegments[i], i).catch(e => console.error(e));
                }
            }
        },
        async generateSegmentAudio(segment, index) {
            if (this.audioCache.has(index)) return this.audioCache.get(index);
            const task = {
                dialogue: segment.content,
                character: segment.character || '',
                emotion: segment.emotion || '',
            };
            this.audioCache.set(index, {
                status: 'pending'
            });
            try {
                const result = await generateAudio(task);
                const blobUrl = await fetchAudioBlob(result.url);
                const audioData = {
                    ...result,
                    blobUrl: blobUrl,
                    status: 'ready'
                };
                this.audioCache.set(index, audioData);
                return audioData;
            } catch (error) {
                console.error(`片段 ${index} 生成失败`, error);
                this.audioCache.delete(index);
                throw error;
            }
        },
        async playNext() {
            if (!this.isActive) return;
            if (this.currentIndex >= this.currentSegments.length) {
                addLog('sys', '[GAL] 播放结束');
                handleStopClick();
                return;
            }
            const index = this.currentIndex;
            const segment = this.currentSegments[index];
            addLog('sys', `[GAL] 播放片段 ${index + 1}/${this.currentSegments.length}: ${segment.content.substring(0, 15)}...`);
            let audioData = this.audioCache.get(index);
            if (!audioData || audioData.status === 'pending') {
                while ((!audioData || audioData.status === 'pending') && this.isActive) {
                    if (!audioData) this.generateSegmentAudio(segment, index);
                    await new Promise(r => setTimeout(r, 200));
                    audioData = this.audioCache.get(index);
                }
            }
            if (!this.isActive) return;
            try {
                await playAudioPromise(audioData.blobUrl);
                if (this.isActive) {
                    this.currentIndex++;
                    this.preloadSegments(this.currentIndex + 1, 2);
                    this.playNext();
                }
            } catch (error) {
                console.error("GAL播放错误", error);
                handleStopClick();
            }
        },
        stop() {
            this.isActive = false;
            this.currentIndex = 0;
            this.audioCache.forEach(item => {
                if (item.blobUrl) URL.revokeObjectURL(item.blobUrl);
            });
            this.audioCache.clear();
        }
    };

    // 模块：UI界面构建与交互
    function makeDraggable(element, handle, saveKey) {
        let isDragging = false;
        let startX, startY, startLeft, startTop;

        const onStart = (e) => {
            if (e.target.closest('button, input, select, textarea, .tts-close-btn')) return;
            isDragging = true;
            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            const clientY = e.touches ? e.touches[0].clientY : e.clientY;
            const rect = element.getBoundingClientRect();
            if (element.style.right && element.style.right !== 'auto') {
                element.style.left = rect.left + 'px';
                element.style.right = 'auto';
            }
            startLeft = rect.left;
            startTop = rect.top;
            startX = clientX;
            startY = clientY;
            element.classList.add('dragging');
            element.style.transition = 'none';
            e.preventDefault();
        };

        const onMove = (e) => {
            if (!isDragging) return;
            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            const clientY = e.touches ? e.touches[0].clientY : e.clientY;
            const dx = clientX - startX;
            const dy = clientY - startY;
            let newLeft = Math.max(0, Math.min(window.innerWidth - element.offsetWidth, startLeft + dx));
            let newTop = Math.max(0, Math.min(window.innerHeight - element.offsetHeight, startTop + dy));
            element.style.left = newLeft + 'px';
            element.style.top = newTop + 'px';
        };

        const onEnd = () => {
            if (!isDragging) return;
            isDragging = false;
            element.classList.remove('dragging');
            element.style.transition = '';
            GM_setValue(saveKey, {
                top: element.style.top,
                left: element.style.left
            });
        };

        handle.addEventListener('mousedown', onStart);
        handle.addEventListener('touchstart', onStart, {
            passive: false
        });
        document.addEventListener('mousemove', onMove);
        document.addEventListener('touchmove', onMove, {
            passive: false
        });
        document.addEventListener('mouseup', onEnd);
        document.addEventListener('touchend', onEnd);
    }

    function createUI() {
        if (document.getElementById('tts-floating-panel')) return;

        const panel = document.createElement('div');
        panel.id = 'tts-floating-panel';
        panel.className = `tts-panel ${edgeMode ? 'edge-mode' : ''}`;

        if (floatPanelPos.left && parseInt(floatPanelPos.left) > window.innerWidth - 40) floatPanelPos.left = (window.innerWidth - 60) + 'px';

        if (floatPanelPos.left) {
            panel.style.left = floatPanelPos.left;
            panel.style.top = floatPanelPos.top;
        } else {
            panel.style.top = floatPanelPos.top;
            panel.style.right = floatPanelPos.right;
        }

        panel.innerHTML = `
            <div class="tts-main-controls">
                <button id="tts-play-btn" class="tts-control-btn primary" title="播放"><i class="icon">▶</i><span class="text">播放</span></button>
                <button id="tts-stop-btn" class="tts-control-btn danger" title="停止" style="display:none"><i class="icon">⏹</i></button>
                <button id="tts-replay-btn" class="tts-control-btn secondary" title="循环当前片段" disabled><i class="icon">🔄</i></button>
                <button id="tts-reinfer-btn" class="tts-control-btn secondary" title="强制重新推理"><i class="icon">⚡</i></button>
                <button id="tts-detect-btn" class="tts-control-btn secondary" title="前端适配检测"><i class="icon">🔍</i></button>
                <button id="tts-settings-btn" class="tts-control-btn settings" title="设置"><i class="icon">⚙</i></button>
                <button id="tts-hide-btn" class="tts-control-btn secondary" title="边缘隐藏"><i class="icon">👁</i></button>
            </div>
        `;

        panel.addEventListener('mouseenter', () => {
            if (edgeMode) panel.classList.add('expanded');
        });
        panel.addEventListener('mouseleave', () => {
            if (edgeMode) panel.classList.remove('expanded');
        });

        document.body.appendChild(panel);
        makeDraggable(panel, panel, 'floatPanelPos');

        document.getElementById('tts-play-btn').onclick = () => handlePlayClick();
        document.getElementById('tts-stop-btn').onclick = handleStopClick;
        document.getElementById('tts-replay-btn').onclick = handleReplayClick;
        document.getElementById('tts-reinfer-btn').onclick = handleReinferClick;

        document.getElementById('tts-detect-btn').onclick = handleFrontendDetect;
        document.getElementById('tts-settings-btn').onclick = toggleSettingsPanel;
        document.getElementById('tts-hide-btn').onclick = toggleEdgeHide;
    }

    function toggleSettingsPanel() {
        const exist = document.getElementById('tts-settings-modal');
        if (exist) {
            exist.remove();
            return;
        }
        const modal = document.createElement('div');
        modal.id = 'tts-settings-modal';
        modal.className = 'tts-modal';

        const windowWidth = window.innerWidth;
        const windowHeight = window.innerHeight;
        const isMobile = windowWidth < 768;
        let useSavedPos = false;

        if (!isMobile) {
            const isDefault = settingsPanelPos.top === '50%' || settingsPanelPos.left === '50%';
            if (!isDefault) {
                const leftNum = parseInt(settingsPanelPos.left);
                const topNum = parseInt(settingsPanelPos.top);
                const isValid = !isNaN(leftNum) && !isNaN(topNum) &&
                    topNum > 20 && topNum < (windowHeight - 50) &&
                    leftNum > 0 && leftNum < (windowWidth - 50);
                if (isValid) {
                    useSavedPos = true;
                } else {
                    console.log("[TTS] 保存的面板位置异常(顶出屏幕或越界)，已重置为屏幕居中");
                }
            }
        }

        const content = document.createElement('div');
        content.className = 'tts-modal-content';

        if (useSavedPos) {
            modal.style.justifyContent = 'flex-start';
            modal.style.alignItems = 'flex-start';
            content.style.position = 'absolute';
            content.style.left = settingsPanelPos.left;
            content.style.top = settingsPanelPos.top;
            content.style.margin = '0';
        } else {
            modal.style.justifyContent = 'center';
            modal.style.alignItems = 'center';
            content.style.position = 'relative';
            content.style.left = 'auto';
            content.style.top = 'auto';
            content.style.transform = 'none';
        }

        const authTokenValue = authToken || "";

        content.innerHTML = `
            <div class="tts-modal-header">
                <h2 style="margin:0;">TTS 播放器设置</h2>
                <div class="header-buttons" style="display:flex; align-items:center;">
                    <button id="btn-logs" class="tts-header-btn" title="查看日志"><i class="icon">📋</i></button>
                    <button id="btn-net" class="tts-header-btn" title="网络诊断"><i class="icon">🔍</i></button>
                    <button id="btn-white" class="tts-header-btn" title="白名单"><i class="icon">🌐</i></button>
                    <button class="tts-close-btn">×</button>
                </div>
            </div>
            <div class="tts-modal-body">
                <div class="tts-setting-section">
                    <h3><i class="icon">🔌</i> 连接设置</h3>
                    <div class="tts-setting-item">
                        <label>自定义TTS API地址</label>
                        <div class="tts-api-input-group" style="display:flex; gap:10px;">
                            <input type="text" id="cfg-api-url" value="${ttsApiUrl}" placeholder="http://127.0.0.1:8000" style="flex:1;">
                            <button id="cfg-test-conn" class="tts-test-btn">测试</button>
                        </div>
                    </div>
                    
                    <div class="tts-setting-item">
                        <label>TTS 鉴权配置</label>
                        <div class="auth-config-container">
                            <select id="auth-type" class="auth-type-select">
                                <option value="none" ${authType === 'none' ? 'selected' : ''}>无需鉴权</option>
                                <option value="bearer" ${authType === 'bearer' ? 'selected' : ''}>Bearer Token</option>
                                <option value="api" ${authType === 'api' ? 'selected' : ''}>API Key</option>
                                <option value="custom" ${authType === 'custom' ? 'selected' : ''}>自定义前缀</option>
                            </select>
                            <div class="auth-input-group">
                                <div class="custom-prefix-wrap" id="custom-prefix-wrap">
                                    <input type="text" id="custom-auth-prefix" class="auth-input custom-auth-prefix" value="${authCustomPrefix}" placeholder="前缀">
                                </div>
                                <input type="text" id="tts-bearer-token" class="auth-input tts-bearer-token" value="${authTokenValue}" placeholder="无需输入">
                            </div>
                        </div>
                    </div>
                    
                    <div class="tts-setting-item">
                        <label>超时配置 (秒)</label>
                        <div style="display: flex; gap: 10px; align-items: center;">
                            <div style="flex: 1;">
                                <span style="font-size:12px; color:#666; display:block; margin-bottom:2px;">API连接/测试</span>
                                <input type="number" id="cfg-timeout-fetch" value="${ttsFetchTimeout / 1000}" min="5" max="300" style="width:100%;">
                            </div>
                            <div style="flex: 1;">
                                <span style="font-size:12px; color:#666; display:block; margin-bottom:2px;">合成音频生成</span>
                                <input type="number" id="cfg-timeout-gen" value="${ttsGenTimeout / 1000}" min="10" max="600" style="width:100%;">
                            </div>
                        </div>
                        <div style="font-size:12px; color:#ff6b6b; margin-top:5px; line-height:1.4; background:#fff0f0; padding:4px; border-radius:4px;">
                            * 失败保护：请求错误每10秒重试1次，最大秒数为上方最大值。<br>
                            * 智能熔断：4xx错误(如鉴权/地址)或JSON异常将直接报错停止。
                        </div>
                    </div>

                    <div class="tts-setting-item">
                        <label>请求体data配置 (JSON)</label>
                        <textarea id="cfg-json-data" rows="4" style="width:100%; font-family:monospace; font-size:12px;">${customDataJson}</textarea>
                    </div>
                    <div class="tts-setting-item">
                        <label class="tts-switch-label">
                            <span>开启合音 模式</span>
                            <div>
                                <input type="checkbox" id="cfg-merge-audio" ${mergeAudioEnabled ? 'checked' : ''}>
                                <span class="tts-switch-slider"></span>
                            </div>
                        </label>
                    </div>
                    <div id="cfg-merge-area" style="display:${mergeAudioEnabled ? 'block' : 'none'}; padding:10px; background:#f0f7ff; border-radius:6px;">
                        <div class="tts-setting-item">
                            <label>上传参考音频 (建议 < 3MB)</label>
                            <input type="file" id="cfg-ref-file" accept="audio/*">
                            <div style="font-size:12px; color:#666; margin-top:4px;" id="cfg-file-status">
                                ${refAudioPath ? `✅ 已保存: ${refAudioPath}` : '未选择文件'}
                            </div>
                        </div>
                        <div class="tts-setting-item">
                            <label>参考音频文本</label>
                            <input type="text" id="cfg-prompt-text" value="${promptText}" placeholder="参考音频说的话">
                        </div>
                    </div>
                </div>

                <div class="tts-setting-section">
                    <h3><i class="icon">🎮</i> 功能设置</h3>
                    <div class="tts-setting-item">
                        <label>播放模式</label>
                        <select id="cfg-play-mode">
                            <option value="stream" ${playbackMode==='stream'?'selected':''}>基础流式播放</option>
                            <option value="non-stream" ${playbackMode==='non-stream'?'selected':''}>非流式播放</option>
                            <option value="gal" ${playbackMode==='gal'?'selected':''}>GAL流式播放</option>
                        </select>
                    </div>
                    <div class="tts-setting-item">
                        <label class="tts-switch-label">
                            <span>自动请求并播放</span>
                            <div>
                                <input type="checkbox" id="cfg-autoplay" ${autoPlayEnabled ? 'checked' : ''}>
                                <span class="tts-switch-slider"></span>
                            </div>
                        </label>
                    </div>
                    
                    <div class="tts-setting-item">
                        <label>识别模式</label>
                        <select name="detection_mode" id="cfg-detection-mode">
                            <option value="character_and_dialogue" ${detectionMode === 'character_and_dialogue' ? 'selected' : ''}>【角色】「对话」</option>
                            <option value="character_emotion_and_dialogue" ${detectionMode === 'character_emotion_and_dialogue' ? 'selected' : ''}>【角色】〈情绪〉「对话」</option>
                            <option value="emotion_and_dialogue" ${detectionMode === 'emotion_and_dialogue' ? 'selected' : ''}>〈情绪〉「对话」</option>
                            <option value="narration_and_dialogue" ${detectionMode === 'narration_and_dialogue' ? 'selected' : ''}>旁白与对话</option>
                            <option value="dialogue_only" ${detectionMode === 'dialogue_only' ? 'selected' : ''}>仅「对话」</option>
                            <option value="entire_message" ${detectionMode === 'entire_message' ? 'selected' : ''}>朗读整段</option>
                        </select>
                    </div>

                    <div class="tts-setting-item">
                        <label>引号样式 (严格匹配)</label>
                        <select id="cfg-quote">
                            <option value="japanese" ${quotationStyle==='japanese'?'selected':''}>「日式引号」</option>
                            <option value="chinese" ${quotationStyle==='chinese'?'selected':''}>“中文引号”</option>
                            <option value="western" ${quotationStyle==='western'?'selected':''}>"西式引号"</option>
                        </select>
                    </div>
                </div>

            <div class="tts-setting-section">
                <h3><i class="icon">🏷️</i> 分组角色设置</h3>
                <div class="tts-group-controls" style="display: flex; align-items: center; gap: 8px; width: 100%;">
                    <input type="text" id="new-group-name" placeholder="角色名称" style="flex: 1; min-width: 0; height: 36px; padding: 0 5px; box-sizing: border-box; margin: 0;">
                    
                    <input type="color" id="new-group-color" value="#667eea" style="flex-shrink: 0; width: 40px; height: 36px; padding: 2px; border: 1px solid #ced4da; border-radius: 6px; box-sizing: border-box; cursor: pointer; margin: 0;">
                    
                    <button id="add-group-btn" class="tts-add-group-btn" style="flex-shrink: 0; height: 36px; margin: 0; padding: 0 10px; display: inline-flex; align-items: center; justify-content: center; box-sizing: border-box; white-space: nowrap;">创建</button>
                </div>
                <div id="character-groups-container"></div>
                <div style="margin-top:10px; border-top:1px dashed #ccc; padding-top:10px;">
                    <h4>检测到的角色池</h4>
                    <div id="detected-chars-list"></div>
                </div>
            </div>
        </div>
    `;

        modal.appendChild(content);
        document.body.appendChild(modal);

        makeDraggable(content, content.querySelector('.tts-modal-header'), 'settingsPanelPos');
        bindSettingsEvents(modal, content);
        renderCharacterGroups(content);
        renderDetectedChars(content);
    }

    // 模块：设置面板逻辑与事件绑定
    function bindSettingsEvents(modal, content) {
        content.querySelector('.tts-close-btn').onclick = () => modal.remove();
        content.querySelector('#btn-logs').onclick = showConsoleLogger;
        content.querySelector('#btn-white').onclick = showWhitelistManager;
        content.querySelector('#btn-net').onclick = performNetworkTest;

        const bindInput = (id, setter) => {
            const el = content.querySelector(id);
            if (el) el.addEventListener('change', (e) => setter(e.target.type === 'checkbox' ? e.target.checked : e.target.value));
        };

        bindInput('#cfg-api-url', v => {
            ttsApiUrl = v;
            GM_setValue('ttsApiUrl', v);
        });

        const authTypeSelect = content.querySelector('#auth-type');
        const customPrefixWrap = content.querySelector('#custom-prefix-wrap');
        const customAuthPrefix = content.querySelector('#custom-auth-prefix');
        const ttsBearerToken = content.querySelector('#tts-bearer-token');

        const placeholderMap = {
            none: '无需输入',
            bearer: '输入 Bearer Token',
            api: '输入 API Key',
            custom: '输入自定义令牌'
        };

        function handleAuthTypeChange() {
            const selectedType = authTypeSelect.value;
            authType = selectedType;
            GM_setValue('authType', selectedType);

            customPrefixWrap.style.display = selectedType === 'custom' ? 'block' : 'none';
            ttsBearerToken.disabled = selectedType === 'none';
            customAuthPrefix.disabled = selectedType !== 'custom';

            ttsBearerToken.placeholder = placeholderMap[selectedType] || '请输入';

            if (selectedType !== 'custom') customAuthPrefix.value = '';
            if (selectedType === 'none') {
                ttsBearerToken.value = '';
                authToken = '';
                GM_setValue('authToken', '');
            }
        }

        authTypeSelect.addEventListener('change', handleAuthTypeChange);
        customAuthPrefix.addEventListener('change', (e) => {
            authCustomPrefix = e.target.value;
            GM_setValue('authCustomPrefix', authCustomPrefix);
        });
        ttsBearerToken.addEventListener('change', (e) => {
            authToken = e.target.value;
            GM_setValue('authToken', authToken);
        });

        handleAuthTypeChange();

        content.querySelector('#cfg-timeout-fetch').addEventListener('change', (e) => {
            let val = parseInt(e.target.value);
            if (isNaN(val) || val < 5) val = 30;
            e.target.value = val;
            ttsFetchTimeout = val * 1000;
            GM_setValue('ttsFetchTimeout', ttsFetchTimeout);
        });

        content.querySelector('#cfg-timeout-gen').addEventListener('change', (e) => {
            let val = parseInt(e.target.value);
            if (isNaN(val) || val < 10) val = 60;
            e.target.value = val;
            ttsGenTimeout = val * 1000;
            GM_setValue('ttsGenTimeout', ttsGenTimeout);
        });

        bindInput('#cfg-json-data', v => {
            customDataJson = v;
            GM_setValue('customDataJson', v);
        });
        bindInput('#cfg-prompt-text', v => {
            promptText = v;
            GM_setValue('promptText', v);
        });
        bindInput('#cfg-play-mode', v => {
            playbackMode = v;
            GM_setValue('playbackMode', v);
        });

        content.querySelector('#cfg-autoplay').addEventListener('change', (e) => {
            const isChecked = e.target.checked;
            autoPlayEnabled = isChecked;
            GM_setValue('autoPlayEnabled', isChecked);

            if (isChecked) {
                lastProcessedMessageId = null;
                addLog('sys', '自动播放已启用 (状态重置)');
                showNotification('自动播放已开启', 'success');
                setTimeout(() => {
                    if (typeof parsePageText === 'function') {
                        const msgs = document.querySelectorAll('div.mes[is_user="false"]');
                        if (msgs.length > 0) {
                            lastProcessedMessageId = null;
                        }
                    }
                }, 100);
            } else {
                addLog('sys', '自动播放已禁用');
            }
        });

        bindInput('#cfg-quote', v => {
            quotationStyle = v;
            GM_setValue('quotationStyle', v);
        });

        content.querySelector('#cfg-merge-audio').addEventListener('change', (e) => {
            mergeAudioEnabled = e.target.checked;
            GM_setValue('mergeAudioEnabled', mergeAudioEnabled);
            content.querySelector('#cfg-merge-area').style.display = mergeAudioEnabled ? 'block' : 'none';
        });

        const detectSelect = content.querySelector('select[name="detection_mode"]');
        if (detectSelect) {
            detectSelect.addEventListener('change', (e) => {
                detectionMode = e.target.value;
                GM_setValue('detectionMode', detectionMode);
            });
        }

        content.querySelector('#cfg-ref-file').addEventListener('change', (e) => {
            const file = e.target.files[0];
            const statusDiv = content.querySelector('#cfg-file-status');
            if (file) {
                statusDiv.textContent = `⏳ 正在处理: ${file.name}...`;
                statusDiv.style.color = 'orange';

                const reader = new FileReader();
                reader.onload = (evt) => {
                    const result = evt.target.result;
                    try {
                        GM_setValue('savedRefAudioBase64', result);
                        GM_setValue('refAudioPath', file.name);

                        savedRefAudioBase64 = result;
                        refAudioPath = file.name;
                        refAudioFile = file;

                        statusDiv.textContent = `✅ 已保存: ${file.name}`;
                        statusDiv.style.color = 'green';
                        addLog('sys', `文件上传成功: ${file.name}`);

                    } catch (err) {
                        console.error('[TTS] 存储音频失败', err);
                        statusDiv.textContent = `❌ 保存失败: 文件太大 (限制约5MB)`;
                        statusDiv.style.color = 'red';

                        refAudioFile = file;
                        alert("文件过大，无法永久保存到插件存储中。\n但在本页面刷新前，合音功能依然可用。");
                    }
                };
                reader.onerror = () => {
                    statusDiv.textContent = `❌ 读取文件失败`;
                    statusDiv.style.color = 'red';
                };
                reader.readAsDataURL(file);
            }
        });

        content.querySelector('#cfg-test-conn').onclick = performNetworkTest;
        content.querySelector('#add-group-btn').onclick = () => {
            const name = content.querySelector('#new-group-name').value.trim();
            const color = content.querySelector('#new-group-color').value;
            if (name && !characterGroups[name]) {
                characterGroups[name] = {
                    color,
                    characters: []
                };
                GM_setValue('characterGroupsOnline', characterGroups);
                renderCharacterGroups(content);
            }
        };
    }

    function renderCharacterGroups(container) {
        const wrap = container.querySelector('#character-groups-container');
        wrap.innerHTML = '';
        Object.entries(characterGroups).forEach(([gName, gData]) => {
            const div = document.createElement('div');
            div.className = 'tts-group-item';
            div.innerHTML = `
                <div class="tts-group-header" style="border-left: 4px solid ${gData.color}; display: flex; align-items: center; justify-content: space-between;">
                    <span>${gName} (${gData.characters.length})</span>
                    <button class="del-grp tts-test-btn" style="background: #dc3545; color: white; height: 24px; line-height: 24px; padding: 0 8px; font-size: 12px; border-radius: 4px; margin: 0;">删除</button>
                </div>
                <div class="tts-group-content">
                    ${gData.characters.map(char => `<div class="tts-group-character"><span>${char}</span><button class="rm-char" data-char="${char}">移除</button></div>`).join('')}
                    <div style="margin-top:5px;"><select class="add-char-sel"><option value="">添加角色...</option></select></div>
                </div>
            `;
            const sel = div.querySelector('.add-char-sel');
            allDetectedCharacters.forEach(c => {
                if (!gData.characters.includes(c)) {
                    const opt = document.createElement('option');
                    opt.value = c;
                    opt.textContent = c;
                    sel.appendChild(opt);
                }
            });
            sel.onchange = (e) => {
                if (e.target.value) {
                    gData.characters.push(e.target.value);
                    GM_setValue('characterGroupsOnline', characterGroups);
                    renderCharacterGroups(container);
                }
            };
            div.querySelector('.del-grp').onclick = () => {
                delete characterGroups[gName];
                GM_setValue('characterGroupsOnline', characterGroups);
                renderCharacterGroups(container);
            };
            div.querySelectorAll('.rm-char').forEach(btn => {
                btn.onclick = (e) => {
                    const c = e.target.dataset.char;
                    gData.characters = gData.characters.filter(x => x !== c);
                    GM_setValue('characterGroupsOnline', characterGroups);
                    renderCharacterGroups(container);
                };
            });
            wrap.appendChild(div);
        });
    }

    function renderDetectedChars(container) {
        const list = container.querySelector('#detected-chars-list');
        list.innerHTML = '';
        allDetectedCharacters.forEach(char => {
            const item = document.createElement('div');
            item.className = 'tts-char-item-simple';
            item.innerHTML = `<span>${char}</span><div><button class="cfg-char" title="配置独立参数">⚙</button><button class="del-char" title="删除">×</button></div>`;
            item.querySelector('.cfg-char').onclick = () => {
                const speed = prompt(`设置 ${char} 的语速 (覆盖全局):`, (characterVoices[char] && characterVoices[char].speed) || 1.0);
                if (speed) {
                    characterVoices[char] = {
                        speed: parseFloat(speed)
                    };
                    GM_setValue('characterVoicesOnline', characterVoices);
                    alert(`已保存 ${char} 的配置`);
                }
            };
            item.querySelector('.del-char').onclick = () => {
                allDetectedCharacters.delete(char);
                GM_setValue('allDetectedCharactersOnline', Array.from(allDetectedCharacters));
                renderDetectedChars(container);
                renderCharacterGroups(container);
            };
            list.appendChild(item);
        });
    }

    // 模块：诊断与调试工具
    async function performNetworkTest() {
        const btn = document.getElementById('cfg-test-conn') || document.activeElement;
        const originalText = btn.textContent;
        btn.textContent = '诊断中...';
        btn.disabled = true;

        const results = [];

        if (typeof GM_xmlhttpRequest === 'undefined') {
            results.push("❌ GM_xmlhttpRequest: 不可用 (请检查油猴权限)");
        } else {
            results.push("✅ GM_xmlhttpRequest: 可用");
        }

        results.push(`📱 User Agent: ${navigator.userAgent}`);
        results.push(`🌐 Platform: ${navigator.platform}`);
        if (typeof GM_info !== 'undefined') {
            results.push(`🔧 Script Handler: ${GM_info.scriptHandler} ${GM_info.version}`);
            results.push(`🔑 Script Version: ${GM_info.script.version}`);
        }
        if (navigator.connection) {
            const {
                effectiveType,
                downlink
            } = navigator.connection;
            results.push(`📡 Connection: ${effectiveType} (${downlink} Mbps)`);
        }

        try {
            const cfRes = await new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: "GET",
                    url: "https://www.cloudflare.com/cdn-cgi/trace",
                    timeout: 5000,
                    onload: resolve,
                    onerror: reject,
                    ontimeout: () => reject(new Error("Timeout"))
                });
            });
            results.push(`✅ 互联网连接 (Cloudflare): ${cfRes.status} ${cfRes.statusText}`);
        } catch (e) {
            results.push(`❌ 互联网连接失败: ${e.message || e}`);
        }

        try {
            const ttsRes = await new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: "GET",
                    url: ttsApiUrl,
                    timeout: ttsFetchTimeout,
                    onload: resolve,
                    onerror: reject,
                    ontimeout: () => reject(new Error("Timeout"))
                });
            });

            if (ttsRes.status >= 200 && ttsRes.status < 300) {
                results.push(`✅ TTS服务器 (${ttsApiUrl}): 连接成功 (${ttsRes.status})`);
                btn.style.background = '#28a745';
            } else {
                results.push(`❌ TTS服务器 (${ttsApiUrl}): 异常状态码 ${ttsRes.status} ${ttsRes.statusText}`);
                btn.style.background = '#dc3545';
            }
        } catch (e) {
            results.push(`❌ TTS服务器 (${ttsApiUrl}): 请求失败 - ${e.message || "无法连接"}`);
            btn.style.background = '#dc3545';
        }

        btn.textContent = originalText;
        btn.disabled = false;

        showDiagnosticModal(results.join('\n'));
    }

    function showDiagnosticModal(resultText) {
        const modal = document.createElement('div');
        modal.className = 'tts-modal';
        modal.innerHTML = `
             <div class="tts-modal-content" style="max-width: 600px;">
                <div class="tts-modal-header">
                    <h2><i class="icon">🔍</i> 网络诊断结果</h2>
                    <button class="tts-close-btn">×</button>
                </div>
                <div class="tts-modal-body">
                    <pre style="background: #f8f9fa; padding: 15px; border-radius: 8px; font-size: 12px; white-space: pre-wrap; max-height: 400px; overflow-y: auto; color: #333; font-family: monospace;">${resultText}</pre>
                    <div style="margin-top: 15px; text-align: center;">
                        <button id="diag-copy-btn" style="padding: 8px 16px; background: #667eea; color: white; border: none; border-radius: 6px; cursor: pointer;">复制结果</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        modal.querySelector('.tts-close-btn').onclick = () => modal.remove();
        modal.querySelector('#diag-copy-btn').onclick = function() {
            navigator.clipboard.writeText(resultText);
            this.textContent = '已复制';
            setTimeout(() => this.textContent = '复制结果', 2000);
        };
        modal.onclick = (e) => {
            if (e.target === modal) modal.remove();
        };
    }

    function showWhitelistManager() {
        const whitelist = GM_getValue(URL_WHITELIST_KEY, []);
        const modal = document.createElement('div');
        modal.className = 'tts-modal';
        modal.innerHTML = `
            <div class="tts-modal-content" style="max-width:500px;">
                <div class="tts-modal-header"><h2>网址白名单</h2><button class="tts-close-btn">×</button></div>
                <div class="tts-modal-body">
                    <div style="display:flex; gap:10px; margin-bottom:10px;"><input type="text" id="wl-input" placeholder="输入域名/URL"><button id="wl-add" class="tts-test-btn">添加</button></div>
                    <div style="margin-bottom:10px;"><button id="wl-add-curr" class="tts-btn small">添加当前网站</button></div>
                    <div id="wl-list" style="max-height:300px; overflow-y:auto; border:1px solid #eee; padding: 5px; border-radius: 4px;">
                        ${whitelist.map(u => `<div class="wl-item" style="padding: 8px 5px; border-bottom: 1px solid #eee; display: flex; justify-content: space-between; align-items: center;"><span style="font-size: 13px; color: #333;">${u}</span><button class="wl-del tts-test-btn" data-url="${u}" style="background: #dc3545; color: white; height: 28px; line-height: 28px; padding: 0 10px; font-size: 12px; margin-left: 10px;">删除</button></div>`).join('')}
                    </div>
                </div>
            </div>`;
        document.body.appendChild(modal);
        modal.querySelector('.tts-close-btn').onclick = () => modal.remove();
        const refresh = () => {
            modal.remove();
            showWhitelistManager();
        };
        const add = (u) => {
            if (u && !whitelist.includes(u)) {
                whitelist.push(u);
                GM_setValue(URL_WHITELIST_KEY, whitelist);
                refresh();
            }
        };
        modal.querySelector('#wl-add').onclick = () => add(modal.querySelector('#wl-input').value);
        modal.querySelector('#wl-add-curr').onclick = () => add(window.location.host);
        modal.querySelectorAll('.wl-del').forEach(b => b.onclick = (e) => {
            const idx = whitelist.indexOf(e.target.dataset.url);
            if (idx > -1) {
                whitelist.splice(idx, 1);
                GM_setValue(URL_WHITELIST_KEY, whitelist);
                refresh();
            }
        });
    }

    function showConsoleLogger() {
        const modal = document.createElement('div');
        modal.className = 'tts-modal';
        const customStyle = `
            .log-detail-box { 
                margin-left: 20px; 
                margin-top: 4px;
                padding: 6px;
                background: #2d2d2d; 
                border-radius: 4px;
                color: #d63384; 
                font-family: monospace; 
                font-size: 11px; 
                white-space: pre-wrap; 
                word-break: break-all;
                line-height: 1.3;
            }
            .log-label {
                color: #aaa;
                font-weight: bold;
                display: block;
                margin-bottom: 4px;
                border-bottom: 1px dashed #444;
                padding-bottom: 2px;
            }
        `;

        modal.innerHTML = `
            <style>${customStyle}</style>
            <div class="tts-modal-content" style="max-width:800px; height:600px;">
                <div class="tts-modal-header">
                    <h2 style="margin:0;">控制台日志</h2>
                    <div class="header-buttons" style="display:flex; align-items:center;">
                        <button class="tts-header-btn" id="log-clear" title="清空日志" style="margin-right:6px;"><i class="icon">🗑️</i></button>
                        <button class="tts-close-btn">×</button>
                    </div>
                </div>
                <div style="padding: 10px; background: #eee; border-bottom: 1px solid #ccc; display: flex; gap: 10px; align-items: center;">
                    <button class="tts-filter-btn active" data-filter="all">全部</button>
                    <button class="tts-filter-btn" data-filter="sys">系统日志</button>
                    <button class="tts-filter-btn" data-filter="net">网络日志</button>
                    <button class="tts-filter-btn" data-filter="err">错误日志</button>
                    <div style="margin-left: auto;">
                        <button class="tts-filter-btn" id="btn-filter-audio" title="点击仅显示音频链接">仅显示 Audio URL</button>
                    </div>
                </div>
                <div class="tts-modal-body" style="padding:0;">
                    <div id="log-view" style="height:100%; overflow-y:auto; background:#1e1e1e; color:#d4d4d4; padding:10px; font-family:monospace; font-size:12px;"></div>
                </div>
            </div>`;
        document.body.appendChild(modal);

        const view = modal.querySelector('#log-view');
        const btns = modal.querySelectorAll('.tts-filter-btn:not(#btn-filter-audio)');
        const audioBtn = modal.querySelector('#btn-filter-audio');

        let currentFilter = 'all';
        let showOnlyAudio = false;

        const render = () => {
            view.innerHTML = '';

            logStore.forEach(l => {
                if (currentFilter !== 'all' && l.type !== currentFilter) return;

                if (showOnlyAudio) {
                    if (!l.details || !l.details.audioUrl) return;
                }

                const row = document.createElement('div');
                row.style.borderBottom = '1px solid #333';
                row.style.padding = '6px 0';

                let typeColor = '#888';
                if (l.type === 'sys') typeColor = '#667eea';
                if (l.type === 'net') typeColor = '#28a745';
                if (l.type === 'err' || l.message.includes('错误') || l.message.includes('失败') || l.message.includes('拒绝')) typeColor = '#dc3545';
                if (l.type === 'warn') typeColor = '#fd7e14';

                let html = `<span style="color:#666">[${l.timestamp}]</span> <span style="color:${typeColor}; font-weight:bold;">[${l.type.toUpperCase()}]</span> ${l.message}`;

                if (l.details) {
                    if (l.details.audioUrl) {
                        html += `<div style="color:#aaa; margin-left:20px; margin-top:2px;">🎵 URL: ${l.details.audioUrl}</div>`;
                    }

                    let contentText = l.details.responseText || (l.details.error ? JSON.stringify(l.details.error, null, 2) : null);

                    if (contentText) {
                        const isUselessText = typeof contentText === 'string' && (
                            contentText.trim() === 'Forbidden' ||
                            contentText.trim() === 'Not Found' ||
                            contentText.includes('<html')
                        );

                        if (!isUselessText) {
                            html += `<div class="log-detail-box"><span class="log-label">📄 Response / Details:</span>${contentText}</div>`;
                        }
                    }
                }
                row.innerHTML = html;
                view.appendChild(row);
            });
            view.scrollTop = view.scrollHeight;
        };

        btns.forEach(b => b.onclick = (e) => {
            btns.forEach(btn => btn.classList.remove('active'));
            e.target.classList.add('active');
            currentFilter = e.target.dataset.filter;
            render();
        });

        audioBtn.onclick = () => {
            showOnlyAudio = !showOnlyAudio;
            if (showOnlyAudio) audioBtn.classList.add('active');
            else audioBtn.classList.remove('active');
            render();
        };

        modal.querySelector('#log-clear').onclick = () => {
            logStore = [];
            render();
        };

        modal.querySelector('.tts-close-btn').onclick = () => modal.remove();
        render();
    }

    // 模块：边缘隐藏功能
    function toggleEdgeHide() {
        const panel = document.getElementById('tts-floating-panel');
        if (!panel) return;

        if (isEdgeHidden) {
            showPanel();
        } else {
            hideToEdge();
        }
    }

    function hideToEdge() {
        const panel = document.getElementById('tts-floating-panel');
        if (!panel) return;

        const rect = panel.getBoundingClientRect();
        originalPosition = {
            left: panel.style.left || rect.left + 'px',
            top: panel.style.top || rect.top + 'px',
            right: panel.style.right,
            transform: panel.style.transform
        };

        panel.style.left = 'auto';
        panel.style.right = '0';
        panel.style.top = rect.top + 'px';
        panel.style.transform = 'translateX(100%)';

        panel.classList.add('edge-hidden');
        isEdgeHidden = true;

        createEdgeIndicator();

        const hideBtn = document.getElementById('tts-hide-btn');
        if (hideBtn) {
            hideBtn.innerHTML = '<i class="icon">👁‍🗨</i>';
            hideBtn.title = '显示面板';
        }

        showNotification('面板已隐藏，点击右侧边缘角标可还原', 'info');
    }

    function showPanel() {
        const panel = document.getElementById('tts-floating-panel');
        if (!panel) return;

        removeEdgeIndicator();

        if (originalPosition) {
            panel.style.left = originalPosition.left;
            panel.style.top = originalPosition.top;
            panel.style.right = originalPosition.right;
            panel.style.transform = originalPosition.transform || 'none';
        } else {
            panel.style.left = 'auto';
            panel.style.right = '20px';
            panel.style.top = '20%';
            panel.style.transform = 'none';
        }

        panel.classList.remove('edge-hidden');
        isEdgeHidden = false;

        const hideBtn = document.getElementById('tts-hide-btn');
        if (hideBtn) {
            hideBtn.innerHTML = '<i class="icon">👁</i>';
            hideBtn.title = '边缘隐藏';
        }
    }

    function createEdgeIndicator() {
        removeEdgeIndicator();

        const indicator = document.createElement('div');
        indicator.id = 'tts-edge-indicator';
        indicator.className = 'tts-edge-indicator';
        indicator.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="24px" height="24px"><path d="M15.707 17.707a1 1 0 0 1-1.414 0L9 12.414l5.293-5.293a1 1 0 0 1 1.414 1.414L11.828 12l3.879 3.879a1 1 0 0 1 0 1.828z"/></svg>`;
        indicator.title = '点击显示TTS面板';

        document.body.appendChild(indicator);

        const panel = document.getElementById('tts-floating-panel');
        if (edgeIndicatorLastTop) {
            indicator.style.top = edgeIndicatorLastTop;
        } else if (panel) {
            const rect = panel.getBoundingClientRect();
            indicator.style.top = (rect.top + 20) + 'px';
        }

        makeIndicatorDraggable(indicator);
    }

    function removeEdgeIndicator() {
        const indicator = document.getElementById('tts-edge-indicator');
        if (indicator) indicator.remove();
    }

    function makeIndicatorDraggable(indicator) {
        let isDragging = false;
        let hasDragged = false;
        let startY, startTop;
        let mouseMoveHandler, mouseUpHandler, touchMoveHandler, touchEndHandler;

        const getClientY = (e) => e.touches ? e.touches[0].clientY : e.clientY;

        const dragStart = (e) => {
            e.stopPropagation();
            if (e.button === 2) return;

            isDragging = true;
            hasDragged = false;

            const clientY = getClientY(e);

            startY = clientY;
            startTop = indicator.getBoundingClientRect().top;

            indicator.style.transition = 'none';
            document.body.style.cursor = 'ns-resize';
            document.body.style.userSelect = 'none';

            mouseMoveHandler = dragMove;
            mouseUpHandler = dragEnd;
            touchMoveHandler = dragMove;
            touchEndHandler = dragEnd;

            document.addEventListener('mousemove', mouseMoveHandler);
            document.addEventListener('mouseup', mouseUpHandler);
            document.addEventListener('touchmove', touchMoveHandler, {
                passive: false
            });
            document.addEventListener('touchend', touchEndHandler);
        };

        const dragMove = (e) => {
            if (!isDragging) return;
            const clientY = getClientY(e);

            if (!hasDragged && Math.abs(clientY - startY) > 5) hasDragged = true;
            if (!hasDragged) return;

            e.preventDefault();
            const deltaY = clientY - startY;
            let newTop = Math.max(0, Math.min(window.innerHeight - indicator.offsetHeight, startTop + deltaY));
            indicator.style.top = `${newTop}px`;
        };

        const dragEnd = (e) => {
            if (!isDragging) return;
            if (hasDragged) edgeIndicatorLastTop = indicator.style.top;

            isDragging = false;
            indicator.style.transition = '';
            document.body.style.cursor = '';
            document.body.style.userSelect = '';

            document.removeEventListener('mousemove', mouseMoveHandler);
            document.removeEventListener('mouseup', mouseUpHandler);
            document.removeEventListener('touchmove', touchMoveHandler);
            document.removeEventListener('touchend', touchEndHandler);
        };

        indicator.addEventListener('mousedown', dragStart);
        indicator.addEventListener('touchstart', dragStart, {
            passive: false
        });
        indicator.addEventListener('click', (e) => {
            if (!hasDragged) {
                showPanel();
            }
        });
    }

    // 模块：文本解析与播放流程控制
    function extractTextDeep(element) {
        if (!element) return '';
        const iframes = element.querySelectorAll('iframe');
        const [qS, qE] = getCurrentQuotePair();

        if (iframes.length > 0) {
            let iframeText = '';
            iframes.forEach(iframe => {
                try {
                    const doc = iframe.contentDocument || iframe.contentWindow?.document;
                    if (doc) {
                        const wrappers = doc.querySelectorAll('.dialogue-wrapper');
                        if (wrappers.length > 0) {
                            wrappers.forEach(wrap => {
                                const char = wrap.querySelector('.dialogue-char')?.textContent.replace(/【|】/g, '').trim();
                                const textDiv = wrap.querySelector('.dialogue-text');
                                const text = textDiv?.dataset.fullText || textDiv?.textContent;
                                if (text) iframeText += char ? `【${char}】${qS}${text}${qE}\n` : `${qS}${text}${qE}\n`;
                            });
                        } else {
                            const narratives = doc.querySelectorAll('.narrative-text');
                            if (narratives.length > 0) narratives.forEach(n => iframeText += n.textContent + '\n');
                            else iframeText += doc.body.textContent + '\n';
                        }
                    }
                } catch (e) {}
            });
            if (iframeText.trim()) return iframeText;
        }
        const summaryElements = element.querySelectorAll('details summary');
        summaryElements.forEach(s => s.style.display = 'none');
        let text = element.innerText || element.textContent;
        summaryElements.forEach(s => s.style.display = '');
        return text;
    }

    function handlePlayClick() {
        if (isPlaying) {
            isPaused = !isPaused;
            if (isPaused) {
                addLog('sys', '用户暂停');
                if (currentAudio) currentAudio.pause();
            } else {
                addLog('sys', '用户恢复播放');
                if (currentAudio) currentAudio.play();
            }
            updatePlayBtnState();
            return;
        }

        const tasks = parsePageText();
        if (!tasks || tasks.length === 0) {
            showNotification('未检测到对话内容', 'warning');
            return;
        }

        handleStopClick();
        isPlaying = true;
        isPaused = false;
        lastMessageParts = tasks;

        updatePlayBtnState();

        if (playbackMode === 'gal') {
            const galData = tasks.map(t => ({
                character: t.character,
                content: t.dialogue,
                emotion: t.emotion
            }));

            GalStreamingPlayer.initialize(galData).then(() => {
                GalStreamingPlayer.playNext();
            });
            return;
        }

        generationQueue = [...tasks];
        processGenerationQueue();
    }

    function handleStopClick() {
        addLog('sys', '停止播放，清理缓存');

        if (GalStreamingPlayer.isActive) {
            GalStreamingPlayer.stop();
        }

        isPlaying = false;
        isPaused = false;
        isGenerating = false;

        generationQueue = [];
        playbackQueue = [];
        sessionAudioCache = [];

        if (currentAudio) {
            currentAudio.pause();
            currentAudio.removeAttribute('src');
            currentAudio = null;
        }
        updatePlayBtnState();
    }

    function handleReplayClick() {
        if (!isPlaying) return;

        if (playbackMode === 'gal') return;

        addLog('sys', '重播当前片段 (检查缓存...)');

        if (currentAudio) currentAudio.pause();
        isPaused = false;

        generationQueue = [];
        playbackQueue = [];

        lastMessageParts.forEach(task => {
            const cachedItem = sessionAudioCache.find(c =>
                c.task.dialogue === task.dialogue &&
                c.task.character === task.character
            );
            if (cachedItem) {
                playbackQueue.push(cachedItem);
            } else {
                generationQueue.push(task);
            }
        });

        if (generationQueue.length > 0) processGenerationQueue();
        processPlaybackQueue();
        updatePlayBtnState();
    }

    function handleReinferClick() {
        addLog('sys', '强制重新推理');
        handleStopClick();
        handlePlayClick();
    }

    function updatePlayBtnState() {
        const playBtn = document.getElementById('tts-play-btn');
        const stopBtn = document.getElementById('tts-stop-btn');
        const replayBtn = document.getElementById('tts-replay-btn');
        const reinferBtn = document.getElementById('tts-reinfer-btn');

        if (!playBtn || !stopBtn) return;

        if (isPlaying) {
            stopBtn.style.display = 'inline-block';
            replayBtn.disabled = playbackMode === 'gal';
            reinferBtn.disabled = false;

            if (isGenerating && playbackMode !== 'gal') {
                playBtn.innerHTML = '<i class="icon">⏳</i><span class="text">生成中...</span>';
                playBtn.disabled = true;
                playBtn.title = "正在生成音频...";
            } else if (isPaused) {
                playBtn.innerHTML = '<i class="icon">▶</i><span class="text">继续</span>';
                playBtn.disabled = false;
                playBtn.title = "继续播放";
            } else {
                playBtn.innerHTML = '<i class="icon">⏸</i><span class="text">暂停</span>';
                playBtn.disabled = false;
                playBtn.title = "暂停";
            }
        } else {
            stopBtn.style.display = 'none';
            playBtn.innerHTML = '<i class="icon">▶</i><span class="text">播放</span>';
            playBtn.disabled = false;
            playBtn.title = "开始播放";
            replayBtn.disabled = true;
            reinferBtn.disabled = false;
        }
    }

    function parsePageText() {
        const msgs = document.querySelectorAll('div.mes[is_user="false"]');
        if (msgs.length === 0) return [];
        const lastMsg = msgs[msgs.length - 1];
        const textEl = lastMsg.querySelector('.mes_text') || lastMsg;
        const fullText = extractTextDeep(textEl).trim();
        if (fullText) lastProcessedMessageId = lastMsg.getAttribute('mesid') || fullText.substring(0, 30);

        const [qStart, qEnd] = getCurrentQuotePair();
        const results = [];
        const addToPool = (c) => {
            if (c && !allDetectedCharacters.has(c)) {
                allDetectedCharacters.add(c);
                GM_setValue('allDetectedCharactersOnline', Array.from(allDetectedCharacters));
            }
        };
        const cleanQuote = (t) => t.substring(1, t.length - 1).trim();
        const cleanNoise = (t) => {
            if (!t) return t;
            return t.replace(/〈[^〉]*〉/g, '').replace(/\([^)]*\)/g, '').replace(/（[^）]*）/g, '').replace(/『[^』]*』/g, '');
        };
        const flexibleRegex = new RegExp(`(?:【([^】]+)】(?:[^${qStart}]*?〈([^〉]+)〉)?.*?)?(${qStart}[^${qEnd}]+${qEnd})`, 'g');

        if (detectionMode === 'character_and_dialogue' || detectionMode === 'character_emotion_and_dialogue') {
            let match;
            while ((match = flexibleRegex.exec(fullText)) !== null) {
                const char = match[1] ? match[1].trim() : null;
                const emotion = match[2] ? match[2].trim() : null;
                const text = cleanQuote(match[3]);
                if (text) {
                    const task = {
                        character: char,
                        dialogue: text
                    };
                    if (detectionMode === 'character_emotion_and_dialogue' && emotion) task.emotion = emotion;
                    results.push(task);
                    if (char) addToPool(char);
                }
            }
        } else if (detectionMode === 'emotion_and_dialogue') {
            const regex = new RegExp(`(?:〈([^〉]+)〉\\s*)?(${qStart}[^${qEnd}]+${qEnd})`, 'g');
            let match;
            while ((match = regex.exec(fullText)) !== null) {
                results.push({
                    character: null,
                    emotion: match[1] ? match[1].trim() : null,
                    dialogue: cleanQuote(match[2])
                });
            }
        } else if (detectionMode === 'narration_and_dialogue') {
            const regex = new RegExp(`(?:【([^】]+)】(?:[^${qStart}]*?〈([^〉]+)〉)?.*?)?(${qStart}[^${qEnd}]+${qEnd})|([^${qStart}${qEnd}\\n]+)`, 'g');
            let match;
            while ((match = regex.exec(fullText)) !== null) {
                if (match[3]) {
                    const char = match[1] ? match[1].trim() : null;
                    const emotion = match[2] ? match[2].trim() : null;
                    let text = cleanNoise(cleanQuote(match[3])).trim();
                    if (text) {
                        results.push({
                            character: char,
                            emotion: emotion,
                            dialogue: text
                        });
                        if (char) addToPool(char);
                    }
                } else if (match[4]) {
                    let narration = cleanNoise(match[4]).trim();
                    if (narration && /[a-zA-Z\u4e00-\u9fa5]/.test(narration)) results.push({
                        character: null,
                        dialogue: narration,
                        isNarration: true
                    });
                }
            }
        } else if (detectionMode === 'dialogue_only') {
            const regex = new RegExp(`${qStart}([^${qEnd}]+?)${qEnd}`, 'g');
            let match;
            while ((match = regex.exec(fullText)) !== null) results.push({
                character: null,
                dialogue: match[1].trim()
            });
        } else if (detectionMode === 'entire_message') {
            const segments = fullText.split('\n');
            segments.forEach(seg => {
                const t = cleanNoise(seg).trim();
                if (t) results.push({
                    character: null,
                    dialogue: t
                });
            });
        }
        if (results.length === 0 && fullText && detectionMode !== 'entire_message') {
            const fallbackRegex = new RegExp(`${qStart}([^${qEnd}]+?)${qEnd}`, 'g');
            let match;
            while ((match = fallbackRegex.exec(fullText)) !== null) results.push({
                character: null,
                dialogue: match[1].trim()
            });
        }
        return results;
    }

    function handleFrontendDetect() {
        const res = parsePageText();
        let msg = '';
        let logDetails = `检测模式: ${detectionMode}\n----------------\n`;
        const previewLines = res.map((r, i) => {
            let line = `${i+1}. `;
            if (r.isNarration) line += `(旁白) "${r.dialogue.substring(0, 50)}..."`;
            else {
                if (r.character) line += `【${r.character}】`;
                if (r.emotion) line += `〈${r.emotion}〉`;
                line += `「${r.dialogue.substring(0, 50)}...」`;
            }
            return line;
        });
        logDetails += previewLines.join('\n');
        addLog('sys', `检测完成: ${res.length} 条`, {
            responseText: logDetails
        });
        msg = `检测到 ${res.length} 条语音片段。\n详细结果已写入系统日志。`;
        alert(msg);
    }

    async function processGenerationQueue() {
        if (!isPlaying || generationQueue.length === 0) {
            isGenerating = false;
            updatePlayBtnState();
            if (generationQueue.length === 0 && playbackQueue.length === 0 && !isGenerating && !currentAudio) {}
            return;
        }

        isGenerating = true;
        updatePlayBtnState();

        const task = generationQueue.shift();

        try {
            const result = await generateAudio(task);

            if (!isPlaying) {
                isGenerating = false;
                updatePlayBtnState();
                return;
            }

            playbackQueue.push(result);
            sessionAudioCache.push(result);

            if (!currentAudio || currentAudio.paused) processPlaybackQueue();
            processGenerationQueue();

        } catch (e) {
            console.error(e);
            processGenerationQueue();
        }
    }

    async function processPlaybackQueue() {
        if (!isPlaying || isPaused) return;

        if (playbackQueue.length === 0) {
            if (generationQueue.length === 0 && !isGenerating) {
                addLog('sys', '播放结束，自动停止');
                handleStopClick();
            }
            return;
        }

        const item = playbackQueue.shift();
        try {
            const blobUrl = await fetchAudioBlob(item.url);

            if (!isPlaying) {
                URL.revokeObjectURL(blobUrl);
                return;
            }
            if (isPaused) {
                playbackQueue.unshift(item);
                URL.revokeObjectURL(blobUrl);
                return;
            }

            if (!document.getElementById('tts-audio-player')) {
                const aud = document.createElement('audio');
                aud.id = 'tts-audio-player';
                document.body.appendChild(aud);
            }

            currentAudio = document.getElementById('tts-audio-player');
            currentAudio.src = blobUrl;

            currentAudio.onended = () => {
                URL.revokeObjectURL(blobUrl);
                processPlaybackQueue();
            };
            currentAudio.onerror = () => {
                URL.revokeObjectURL(blobUrl);
                processPlaybackQueue();
            };

            const p = currentAudio.play();
            if (p) p.catch(() => processPlaybackQueue());

        } catch (e) {
            processPlaybackQueue();
        }
    }

    // 模块：自动播放监听
    function observeChat() {
        const observerCallback = (mutations, observer) => {
            if (!autoPlayEnabled) return;

            if (autoPlayTimer) clearTimeout(autoPlayTimer);

            autoPlayTimer = setTimeout(() => {
                if (!autoPlayEnabled) return;

                const msgs = document.querySelectorAll('div.mes[is_user="false"]');
                if (msgs.length === 0) return;

                const lastMsg = msgs[msgs.length - 1];
                const textEl = lastMsg.querySelector('.mes_text') || lastMsg;
                const currentId = lastMsg.getAttribute('mesid') || textEl.textContent.substring(0, 50);

                if (currentId === lastProcessedMessageId) return;

                if (isPlaying) {
                    if (playbackMode === 'non-stream') {
                        addLog('sys', `自动播放: 忽略新消息 (非流式模式正在播放中)`);
                        return;
                    }
                    addLog('sys', `自动播放: 检测到新消息，清空当前队列并重新开始`);
                    handleStopClick();
                }

                const tasks = parsePageText();

                if (tasks && tasks.length > 0) {
                    addLog('sys', `自动播放: 执行新请求 [${currentId}]`);
                    lastProcessedMessageId = currentId;

                    handlePlayClick();
                }

            }, 1000);
        };

        const observer = new MutationObserver(observerCallback);

        const mountObserver = () => {
            const chatContainer = document.querySelector('#chat');
            if (chatContainer) {
                observer.observe(chatContainer, {
                    childList: true,
                    subtree: true,
                    characterData: true
                });
                console.log('[TTS] 自动播放监听器已挂载');
            } else {
                setTimeout(mountObserver, 1000);
            }
        };

        mountObserver();
    }

    // 模块：样式注入
    GM_addStyle(`
        #tts-floating-panel, div.tts-modal, #tts-notification-container {
            font-family: system-ui, -apple-system, sans-serif !important;
            font-size: 14px;
            line-height: 1.5;
            color: #333;
            box-sizing: border-box;
            text-align: left;
        }
        #tts-floating-panel *, div.tts-modal *, #tts-notification-container * {
            box-sizing: border-box;
        }

        #tts-floating-panel {
            position: fixed; z-index: 9999;
            background: rgba(255, 255, 255, 0.95);
            backdrop-filter: blur(10px);
            border: 1px solid rgba(255, 255, 255, 0.3);
            border-radius: 16px; padding: 12px;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
            transition: opacity 0.3s, transform 0.3s;
            user-select: none;
            display: flex; flex-direction: column; align-items: center; 
            width: auto; height: auto;
        }
        #tts-floating-panel.edge-mode {
            right: 0px !important; left: auto !important;
            width: auto !important; transform: translateX(0) !important; 
            transition: transform 0.4s cubic-bezier(0.4, 0, 0.2, 1);
        }
        #tts-floating-panel.edge-hidden {
            transform: translateX(120%) !important; opacity: 0.5; pointer-events: none;
        }
        #tts-edge-indicator {
            position: fixed; right: 0px; top: 50%; width: 30px; height: 60px;
            background: rgba(102, 126, 234, 0.3); border: none; color: #667eea; 
            display: flex; align-items: center; justify-content: center;
            border-radius: 10px 0 0 10px; cursor: pointer; z-index: 10000;
            transition: all 0.3s; user-select: none;
        }
        #tts-edge-indicator:hover { background: rgba(102,126,234,0.8); width: 36px; color: white; }

        #tts-floating-panel .tts-main-controls { display: flex; gap: 5px; align-items: center; justify-content: center; flex-direction: column; }
        #tts-floating-panel .tts-control-btn {
            display: flex; align-items: center; justify-content: center;
            min-width: 40px; height: 40px; border: none; border-radius: 12px;
            font-size: 18px; cursor: pointer; transition: all 0.2s;
            color: white; box-shadow: 0 4px 6px rgba(0,0,0,0.1); margin: 0; padding: 0 10px;
        }
        #tts-floating-panel .tts-control-btn:hover { transform: translateY(-2px); }
        #tts-floating-panel .tts-control-btn .text { font-size: 12px; margin-left: 6px; display: inline-block; }
        #tts-floating-panel .tts-control-btn.primary { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); }
        #tts-floating-panel .tts-control-btn.danger { background: linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%); color: #d63384; }
        #tts-floating-panel .tts-control-btn.secondary { background: linear-gradient(135deg, #a8edea 0%, #fed6e3 100%); color: #495057; }
        #tts-floating-panel .tts-control-btn.settings { background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); }

        div.tts-modal {
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0,0,0,0.5); z-index: 10000;
            display: flex; 
            align-items: center; justify-content: center;
            padding: 30px; 
        }
        
        div.tts-modal .tts-modal-content {
            background: white; 
            border-radius: 16px; 
            width: 600px; max-width: 95vw; 
            max-height: 90vh; 
            display: flex; flex-direction: column; 
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
            position: relative;
            overflow: hidden; 
            margin: auto; 
        }
        
        div.tts-modal .tts-modal-header {
            padding: 15px 20px; flex-shrink: 0;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white; display: flex; justify-content: space-between; align-items: center;
            cursor: move; 
        }
        div.tts-modal .tts-modal-header h2 { margin: 0; font-size: 18px; color: white; }
        div.tts-modal .tts-header-btn, div.tts-modal .tts-close-btn { 
            background: rgba(255,255,255,0.2); border: none; color: white; width: 32px; height: 32px; 
            border-radius: 50%; cursor: pointer; margin-left: 5px; 
            display: flex; justify-content: center; align-items: center; padding: 0; font-size: 14px;
        }
        div.tts-modal .tts-modal-body { 
            padding: 20px; overflow-y: auto; flex: 1; min-height: 0;
            -webkit-overflow-scrolling: touch;
        }

        div.tts-modal .tts-setting-section { background: #f8f9fa; border: 1px solid #e9ecef; border-radius: 12px; padding: 15px; margin-bottom: 15px; }
        div.tts-modal .tts-setting-section h3 { margin: 0 0 10px 0; font-size: 16px; color: #495057; border-bottom: 2px solid #dee2e6; padding-bottom: 5px; }
        div.tts-modal .tts-setting-item { margin-bottom: 12px; }
        div.tts-modal label { display: block; font-weight: 500; margin-bottom: 5px; font-size: 14px; color: #333; }
        
        div.tts-modal input[type="text"], 
        div.tts-modal input[type="number"], 
        div.tts-modal textarea, 
        div.tts-modal select {
            width: 100%; padding: 8px; border: 1px solid #ced4da; border-radius: 6px;
            font-size: 14px; background-color: #ffffff !important; color: #333333 !important;
            outline: none; margin: 0; min-height: 36px;
        }
        div.tts-modal select, div.tts-modal select option { background-color: #ffffff !important; color: #333333 !important; }

        div.tts-modal input[type="file"] {
            display: block; 
            width: 100%; 
            padding: 8px 0;
            color: #333;
            background: transparent;
            cursor: pointer;
            min-height: 36px;
        }

        /* 修复：移动端分组控件溢出，使用 min-width:0 防止 flex 子项撑开容器 */
        div.tts-modal .tts-group-controls {
            display: flex !important; align-items: center !important; gap: 8px !important; width: 100%;
        }
        div.tts-modal #new-group-name { 
            width: auto !important; flex: 1 !important; min-width: 0 !important; margin: 0 !important; 
        }
        div.tts-modal #new-group-color { flex-shrink: 0; margin: 0 !important; }
        div.tts-modal #add-group-btn { flex-shrink: 0; margin: 0 !important; }
        div.tts-modal .tts-test-btn { background: #28a745; color: white; border: none; padding: 0 15px; border-radius: 6px; cursor: pointer; height: 36px; line-height: 36px; display: inline-block; }
        div.tts-modal .tts-add-group-btn, div.tts-modal #add-group-btn {
            background: #667eea !important; color: white !important; 
            border: none; padding: 0 12px; cursor: pointer; border-radius: 4px; height: 36px; 
            display: inline-flex; align-items: center; justify-content: center;
        }
        div.tts-modal .rm-char, div.tts-modal .del-grp, div.tts-modal .wl-del {
            background: #dc3545 !important; color: white !important;
            border: none; cursor: pointer; border-radius: 4px; 
            padding: 0 12px; font-size: 12px; 
            height: 26px; line-height: 26px; 
            display: inline-flex; align-items: center; justify-content: center;
        }
        div.tts-modal #wl-add-curr { background: #6c757d !important; color: white !important; }
        div.tts-modal .tts-filter-btn { background: #fff; border: 1px solid #ccc; padding: 4px 12px; border-radius: 14px; cursor: pointer; font-size: 12px; color: #555; margin-right: 5px; }
        div.tts-modal .tts-filter-btn.active { background: #667eea !important; color: white !important; border-color: #667eea !important; }

        div.tts-modal #wl-input { flex: 1; width: auto !important; }
        div.tts-modal #wl-add { flex-shrink: 0; white-space: nowrap; margin-left: 5px; }
        div.tts-modal .tts-group-item { background: #fff; border: 1px solid #eee; border-radius: 8px; margin-bottom: 10px; }
        div.tts-modal .tts-group-header { padding: 8px 12px; background: #f1f3f5; display: flex; justify-content: space-between; font-weight: bold; }
        div.tts-modal .tts-group-content { padding: 8px; display: flex; flex-direction: column; gap: 6px; }
        div.tts-modal .tts-group-character { 
            background: #e7f5ff; color: #1c7ed6; 
            padding: 5px 10px; border-radius: 8px; font-size: 13px;
            width: 100%; display: flex; justify-content: space-between; align-items: center;
        }
        div.tts-modal .tts-group-character span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-right: 10px; }
        div.tts-modal .tts-group-content > div:last-child {
            width: 100%; margin-top: 5px; background-color: #e7f5ff; padding: 5px; border-radius: 8px;
        }
        div.tts-modal .add-char-sel { border-color: #cfe2ff !important; }

        div.tts-modal #detected-chars-list { display: flex; flex-direction: column; gap: 5px; }
        div.tts-modal .tts-char-item-simple { 
            display: flex; justify-content: space-between; align-items: center; 
            padding: 6px 8px; border-bottom: 1px solid #eee; background: #fff; border-radius: 4px;
        }
        div.tts-modal .tts-char-item-simple:last-child { border-bottom: none; }
        div.tts-modal .tts-char-item-simple > div { display: flex; gap: 6px; }
        div.tts-modal .cfg-char { background: #28a745 !important; color: white !important; border: none; cursor: pointer; border-radius: 4px; width: 28px; height: 28px; display: inline-flex; align-items: center; justify-content: center; }
        div.tts-modal .del-char { background: #dc3545 !important; color: white !important; border: none; cursor: pointer; border-radius: 4px; width: 28px; height: 28px; display: inline-flex; align-items: center; justify-content: center; }

        div.tts-modal .auth-config-container { display: flex; flex-direction: column; gap: 7px; width: 100%; }
        div.tts-modal .auth-input-group { display: flex; width: 100%; gap: 5px; }
        div.tts-modal .custom-prefix-wrap { width: 100px; display: none; }
        
       
        div.tts-modal .tts-switch-label { 
            display: flex; 
            align-items: center; 
            justify-content: space-between; 
            width: 100%; 
            margin: 0; 
            cursor: pointer; 
            min-height: 40px; 
            user-select: none;
        }
        div.tts-modal .tts-switch-slider { 
            position: relative; 
            display: inline-block; 
            width: 44px; 
            height: 24px; 
            background: #ccc; 
            border-radius: 24px; 
            transition: .3s; 
            vertical-align: middle;
            flex-shrink: 0;
        }
        div.tts-modal .tts-switch-slider:before { 
            content: ""; 
            position: absolute; 
            height: 18px; 
            width: 18px; 
            left: 3px; 
            bottom: 3px; 
            background: white; 
            border-radius: 50%; 
            transition: .3s; 
            box-shadow: 0 1px 3px rgba(0,0,0,0.3);
        }
        div.tts-modal input:checked + .tts-switch-slider { background: #667eea; }
        div.tts-modal input:checked + .tts-switch-slider:before { transform: translateX(20px); }
        div.tts-modal input[type="checkbox"] { display: none; }
        
        .log-detail-box { margin-left: 20px; margin-top: 4px; padding: 6px; background: #2d2d2d; border-radius: 4px; color: #d63384; font-family: monospace; font-size: 11px; white-space: pre-wrap; word-break: break-all; }

        @media (max-width: 768px) {
            #tts-floating-panel { transform: scale(0.9); padding: 8px; }
            #tts-floating-panel .tts-control-btn .text { display: none; }
            
            div.tts-modal {
                align-items: flex-start !important;
                padding-top: 20px !important; 
                padding-bottom: 20px !important;
                padding-left: 10px !important;
                padding-right: 10px !important;
            }

            div.tts-modal .tts-modal-content {
                position: relative !important;
                left: auto !important; top: auto !important; transform: none !important;
                width: 100% !important; max-width: 100% !important;
                max-height: 85vh !important;
                margin: 0 auto !important;
            }
        }
    `);

    // 模块：初始化入口
    function init() {
        if (!isCurrentUrlWhitelisted()) {
            console.log("TTS: 当前网站不在白名单中，已禁用。");
            return;
        }
        initConsoleLogger();
        createUI();
        observeChat();
        console.log("多角色TTS播放器 Loaded");
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
