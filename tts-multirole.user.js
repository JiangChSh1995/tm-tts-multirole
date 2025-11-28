// ==UserScript==
// @name         SillyTavern 酒馆TTS播放器 (兼容正式版v1.0)
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  [在线TTS核心功能 v1.0] 全场景请求模式兼容，无缝支持本地服务、在线API双场景，自动适配不同部署环境无需额外修改配置；集成OpenAPI v3.1鉴权机制（Bearer Token、API Key、自定义前缀、无前缀及无需鉴权5种模式），设置界面可视化配置且令牌本地持久化；前端新增双超时设置面板（在线API超时10-300秒/合成音频超时30-600秒），支持秒级输入、实时生效且配置本地长久保存；将TTS_API_ENDPOINT_MODELS接口请求方式调整为GET，解决模型列表获取异常问题，兼容流式/非流式传输（默认关闭流式：let isStreamingMode = false）；鉴权、超时设置面板保持统一视觉风格，适配手机端显示，输入框与选择框布局合理操作便捷；所有数据（鉴权令牌、超时配置等）均存储于本地浏览器，不涉及云端上传保障隐私安全；[网址白名单增强功能 v1.0] 白名单规则同时适配本地服务、在线API使用场景，空列表时默认所有网站可见，配置后仅白名单内网站显示TTS功能；白名单管理入口位于设置面板头部，与「检查网络」「查看日志」功能并列，操作路径直观；提供网址添加、单个删除、批量清空功能，输入框支持基础格式校验避免无效配置；保留原有所有识别模式及功能逻辑，无任何功能阉割，老用户升级无感知。
// @author       AI & You & Me & All Contributors
// @thanks       To every individual who devoted time, shared insights, or contributed to the refinement—your efforts in debugging, optimizing compatibility, and enhancing user experience have made this work complete.
// @match        *://*/*
// @exclude      http://127.0.0.1:9880/*
// @exclude      http://127.0.0.1:7860/*
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addStyle
// @connect      *
// ==/UserScript==
(function() {
    'use strict';

    // API地址配置变量
    let ttsApiBaseUrl = "http://127.0.0.1:8000"; // 默认地址
    let TTS_API_ENDPOINT_INFER = "";
    let TTS_API_ENDPOINT_MODELS = "";
    let TTS_API_ENDPOINT_INFER_CLASSIC_MODELS = "";
    let TTS_API_ENDPOINT_INFER_CLASSIC = "";
    

    const DO_NOT_PLAY_VALUE = '_DO_NOT_PLAY_';
    const DEFAULT_DETECTION_MODE = 'character_and_dialogue';


    // 控制台日志存储
    let consoleLogs = [];
    let originalConsole = {
        log: console.log,
        warn: console.warn,
        error: console.error,
        info: console.info
    };

    // 初始化日志捕获
    function initConsoleLogger() {
        // 捕获 console.log
        console.log = function(...args) {
            originalConsole.log.apply(console, args);
            consoleLogs.push({
                type: 'log',
                message: args.map(arg => typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)).join(' '),
                timestamp: new Date().toLocaleTimeString()
            });
        };

        // 捕获 console.warn
        console.warn = function(...args) {
            originalConsole.warn.apply(console, args);
            consoleLogs.push({
                type: 'warn',
                message: args.map(arg => typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)).join(' '),
                timestamp: new Date().toLocaleTimeString()
            });
        };

        // 捕获 console.error
        console.error = function(...args) {
            originalConsole.error.apply(console, args);
            consoleLogs.push({
                type: 'error',
                message: args.map(arg => typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)).join(' '),
                timestamp: new Date().toLocaleTimeString()
            });
        };

        // 捕获 console.info
        console.info = function(...args) {
            originalConsole.info.apply(console, args);
            consoleLogs.push({
                type: 'info',
                message: args.map(arg => typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)).join(' '),
                timestamp: new Date().toLocaleTimeString()
            });
        };
    }

    // 更新API端点地址
    function updateApiEndpoints() {
        // 兼容原脚本的 infer_single 接口
        TTS_API_ENDPOINT_INFER = `${ttsApiBaseUrl}/infer_single`;
        TTS_API_ENDPOINT_MODELS = `${ttsApiBaseUrl}/models/${ttsApiVersion}`;
        // 新增 classic 接口（跨模块共享变量：TTS_API_ENDPOINT_INFER_CLASSIC）
        TTS_API_ENDPOINT_INFER_CLASSIC_MODELS = `${ttsApiBaseUrl}/classic_model_list/${ttsApiVersion}`;
        TTS_API_ENDPOINT_INFER_CLASSIC = `${ttsApiBaseUrl}/infer_classic`;
    }

    let ttsApiVersion = 'v4';
    let detectionMode = DEFAULT_DETECTION_MODE;

    // ===模式与配置变量 ===
    // 跨模块共享变量：ttsInferMode, commonInferParams, JchshParams
    let ttsInferMode = GM_getValue('ttsInferModeOnline', 'infer_single'); // 模式选择

    // **公用推理参数 (用于覆盖 infer_single 中的固定值)**
    let commonInferParams = GM_getValue('commonInferParamsOnline', {
        top_k: 10,
        top_p: 1,
        temperature: 1,
        repetition_penalty: 1.35
    });

    // **合音模式独有配置 (匹配 JSON 结构)**
    let JchshParams = GM_getValue('JchshParamsOnline', {
        version: "v4",
        gpt_model_name: "",
        sovits_model_name: "", // 此字段由参考音频决定，此处留空
        ref_audio_path: "",
        prompt_text: "",
        prompt_text_lang: "",
        text_lang: "zh",
        text_split_method: "按标点符号切",
        batch_size: 1,
        batch_threshold: 0.75,
        split_bucket: true,
        fragment_interval: 0.3,
        media_type: "wav",
        parallel_infer: true,
        seed: -1,
        sample_steps: 16,
        if_sr: false
    });
    let JchshGptModels = []; // 合音模式 GPT 模型列表

    // ===文件持久化逻辑和变量 ===
    // 跨模块共享变量：savedVoiceFileName, savedVoiceFileBase64, voiceFile
    let savedVoiceFileName = GM_getValue('savedVoiceFileNameOnline', null);
    let savedVoiceFileBase64 = GM_getValue('savedVoiceFileBase64Online', null);
    let voiceFile = null; // 全局 File 对象，用于存储和传输

    // 辅助函数：将 Base64 还原为 Blob/File 对象
    const b64toBlob = (b64Data, contentType = '', sliceSize = 512) => {
        const byteCharacters = atob(b64Data);
        const byteArrays = [];
        for (let offset = 0; offset < byteCharacters.length; offset += sliceSize) {
            const slice = byteCharacters.slice(offset, offset + sliceSize);
            const byteNumbers = new Array(slice.length);
            for (let i = 0; i < slice.length; i++) {
                byteNumbers[i] = slice.charCodeAt(i);
            }
            byteArrays.push(new Uint8Array(byteNumbers));
        }
        return new Blob(byteArrays, {
            type: contentType
        });
    };

    // 脚本启动时尝试从本地存储恢复文件
    if (savedVoiceFileBase64 && savedVoiceFileName) {
        try {
            const contentType = savedVoiceFileBase64.split(';')[0].split(':')[1];
            const blob = b64toBlob(savedVoiceFileBase64.split(',')[1], contentType);
            // 恢复 voiceFile
            voiceFile = new File([blob], savedVoiceFileName, {
                type: blob.type
            });
            console.log(`TTS: 成功从本地加载参考音频 ${savedVoiceFileName}`);
        } catch (e) {
            console.error("TTS: 还原参考音频文件失败", e);
            GM_setValue('savedVoiceFileNameOnline', null);
            GM_setValue('savedVoiceFileBase64Online', null);
        }
    }
    // ===================================

    let speedFacter = 1.0;
    let emotion = '默认';
    let narrationVoice = '';
    let dialogueVoice = '';
    let ttsModels = [],
        ttsModelsWithDetails = {},
        characterVoices = {},
        defaultVoice = '',
        allDetectedCharacters = new Set(),
        characterGroups = {}, // 角色分组: { groupName: { characters: [char1, char2], color: '#color' } }
        lastMessageParts = [],
        generationQueue = [],
        playbackQueue = [],
        lastPlayedQueue = [],
        isPlaying = false,
        isPaused = false,
        currentAudio = null;

    // 播放队列锁定和序列跟踪
    let isProcessingQueue = false;
    let currentPlaybackIndex = 0;
    let playbackSequenceId = 0;

    // 流式播放相关变量
    let isStreamingMode = false;
    let streamingSegments = [];
    let currentStreamingIndex = 0;
    let streamingAudioCache = new Map();
    let streamingConfig = {
        enabled: false,
        autoStart: true,
        syncTolerance: 200,
        preloadBuffer: 2,
        debugMode: false
    };

    // 模型缓存
    let modelCache = new Map();

    // 性能优化相关变量
    let audioCache = new Map();
    let generationPromises = new Map();
    let maxConcurrentGenerations = 3;
    let currentGenerations = 0;
    let preloadEnabled = true;
    let batchMode = true;

    // 功能变量
    let autoPlayEnabled = false;
    let quotationStyle = 'japanese';
    let edgeMode = false; // 边缘依附模式

    // 前端美化适配相关变量
    let frontendAdaptationEnabled = false; // 前端美化适配开关

    // 修复重复播放问题的变量
    let lastProcessedMessageId = null;
    let autoPlayTimeout = null;

    // 鉴权相关全局变量
    let authType = 'none'; // 默认无需鉴权
    let TTS_BEARER_TOKEN = ''; // 鉴权Token/Key
    let customAuthPrefix = ''; // 自定义鉴权前缀

    // 超时全局变量
    let TTS_FETCH_TIMEOUT = 120000; // 120秒
    let TTS_GENERATE_TIMEOUT = 180000; // 180秒

    // 长久化存储变量
    const Settings = {
        load: function() {
            ttsApiBaseUrl = GM_getValue('ttsApiBaseUrlOnline', '');
            updateApiEndpoints(); // 更新API端点
            ttsApiVersion = GM_getValue('ttsApiVersionOnline', 'v4');
            detectionMode = GM_getValue('detectionModeOnline', DEFAULT_DETECTION_MODE);
            speedFacter = GM_getValue('speedFacterOnline', 1.0);
            emotion = GM_getValue('emotionOnline', '默认');
            narrationVoice = GM_getValue('narrationVoiceOnline', '');
            dialogueVoice = GM_getValue('dialogueVoiceOnline', '');
            characterVoices = GM_getValue('characterVoicesOnline', {});
            characterGroups = GM_getValue('characterGroupsOnline', {});
            defaultVoice = GM_getValue('defaultVoiceOnline', '');
            const savedChars = GM_getValue('allDetectedCharactersOnline', []);
            allDetectedCharacters = new Set(savedChars);
            maxConcurrentGenerations = GM_getValue('maxConcurrentGenerationsOnline', 3);
            preloadEnabled = GM_getValue('preloadEnabledOnline', true);
            batchMode = GM_getValue('batchModeOnline', true);
            autoPlayEnabled = GM_getValue('autoPlayEnabledOnline', false);
            quotationStyle = GM_getValue('quotationStyleOnline', 'japanese');
            edgeMode = GM_getValue('edgeModeOnline', false);
            frontendAdaptationEnabled = GM_getValue('frontendAdaptationEnabledOnline', false);
            authType = GM_getValue('authTypeOnline', 'none');
            TTS_BEARER_TOKEN = GM_getValue('ttsBearerTokenOnline', '');
            customAuthPrefix = GM_getValue('customAuthPrefixOnline', '');

            // ===合音模式配置加载 ===
            ttsInferMode = GM_getValue('ttsInferModeOnline', 'infer_single');
            commonInferParams = GM_getValue('commonInferParamsOnline', commonInferParams);
            JchshParams = GM_getValue('JchshParamsOnline', JchshParams);

            // 超时配置读取
            TTS_FETCH_TIMEOUT = GM_getValue('ttsFetchTimeoutOnline', 120) * 1000;
            TTS_GENERATE_TIMEOUT = GM_getValue('ttsGenerateTimeoutOnline', 180) * 1000;
            setTimeout(() => {
                    // -------------- 鉴权配置同步 --------------
                    const authTypeSelect = document.getElementById('auth-type');
                    const tokenInput = document.getElementById('tts-bearer-token');
                    const customPrefixInput = document.getElementById('custom-auth-prefix');
                    if (authTypeSelect && tokenInput && customPrefixInput) {
                        authTypeSelect.value = authType;
                        tokenInput.value = TTS_BEARER_TOKEN;
                        customPrefixInput.value = customAuthPrefix;
                        // 触发一次类型切换事件，同步输入框显示/禁用状态
                        authTypeSelect.dispatchEvent(new Event('change'));
                    }

                    // -------------- 超时配置同步 --------------
                    const fetchTimeoutInput = document.getElementById('tts-fetch-timeout');
                    const generateTimeoutInput = document.getElementById('tts-generate-timeout');
                    if (fetchTimeoutInput && generateTimeoutInput) {
                        fetchTimeoutInput.value = TTS_FETCH_TIMEOUT / 1000;
                        generateTimeoutInput.value = TTS_GENERATE_TIMEOUT / 1000;
                    }

                    // （后续新增其他配置项，直接在这里添加同步逻辑即可）                
                },


                100); // 延迟执行，确保DOM已加载
        },

        save: function() {
            GM_setValue('ttsApiBaseUrlOnline', ttsApiBaseUrl);
            GM_setValue('ttsApiVersionOnline', ttsApiVersion);
            GM_setValue('detectionModeOnline', detectionMode);
            GM_setValue('speedFacterOnline', speedFacter);
            GM_setValue('emotionOnline', emotion);
            GM_setValue('narrationVoiceOnline', narrationVoice);
            GM_setValue('dialogueVoiceOnline', dialogueVoice);
            GM_setValue('characterVoicesOnline', characterVoices);
            GM_setValue('characterGroupsOnline', characterGroups);
            GM_setValue('defaultVoiceOnline', defaultVoice);
            GM_setValue('allDetectedCharactersOnline', Array.from(allDetectedCharacters));
            GM_setValue('maxConcurrentGenerationsOnline', maxConcurrentGenerations);
            GM_setValue('preloadEnabledOnline', preloadEnabled);
            GM_setValue('batchModeOnline', batchMode);
            GM_setValue('autoPlayEnabledOnline', autoPlayEnabled);
            GM_setValue('quotationStyleOnline', quotationStyle);
            GM_setValue('edgeModeOnline', edgeMode);
            GM_setValue('frontendAdaptationEnabledOnline', frontendAdaptationEnabled);
            GM_setValue('authTypeOnline', authType);
            GM_setValue('ttsBearerTokenOnline', TTS_BEARER_TOKEN);
            GM_setValue('customAuthPrefixOnline', customAuthPrefix);
            GM_setValue('ttsFetchTimeoutOnline', TTS_FETCH_TIMEOUT / 1000);
            GM_setValue('ttsGenerateTimeoutOnline', TTS_GENERATE_TIMEOUT / 1000);
            
            // ===合音模式配置保存 ===
            GM_setValue('ttsInferModeOnline', ttsInferMode);
            GM_setValue('commonInferParamsOnline', commonInferParams);
            GM_setValue('JchshParamsOnline', JchshParams);
        }
    };

    // 生成缓存键
    function generateCacheKey(text, voice, params) {
        return `${voice}_${text}_${JSON.stringify(params)}`;
    }

    // 清理过期缓存
    function cleanupCache() {
        if (audioCache.size > 50) {
            const keys = Array.from(audioCache.keys());
            const keysToDelete = keys.slice(0, keys.length - 30);
            keysToDelete.forEach(key => {
                const cached = audioCache.get(key);
                if (cached && cached.blobUrl) {
                    URL.revokeObjectURL(cached.blobUrl);
                }
                audioCache.delete(key);
            });
        }
    }

    // 顺序生成音频（禁用批量模式以保持对话顺序）
    async function generateAudioSequentially(tasks) {
        const results = [];
        for (const task of tasks) {
            try {
                const result = await generateSingleAudio(task);
                results.push(result);
            } catch (error) {
                console.error('音频生成失败:', error);
                // 继续处理下一个任务，不中断整个流程
            }
        }
        return results;
    }

    // ==================== 流式播放功能 ====================

    /**
     * 开始流式播放模式
     * @param {Array} segments - 文本段落数组
     * @param {Object} options - 配置选项
     */
    async function startStreamingPlayback(segments, options = {}) {
        if (isStreamingMode) {
            stopStreamingPlayback();
        }

        isStreamingMode = true;
        currentStreamingIndex = 0;
        streamingSegments = segments;
        streamingAudioCache.clear();

        console.log('开始流式播放模式，段落数:', segments.length);

        // 预生成前几个段落的音频
        const preGenerateCount = Math.min(3, segments.length);
        for (let i = 0; i < preGenerateCount; i++) {
            if (segments[i]) {
                generateStreamingSegmentAudio(segments[i], i).catch(error => {
                    console.error(`预生成段落 ${i} 失败:`, error);
                });
            }
        }

        return true;
    }

    /**
     * 停止流式播放模式
     */
    function stopStreamingPlayback() {
        isStreamingMode = false;
        currentStreamingIndex = 0;
        streamingSegments = [];

        // 清理音频缓存
        streamingAudioCache.forEach((audioData, key) => {
            if (audioData.blobUrl) {
                URL.revokeObjectURL(audioData.blobUrl);
            }
        });
        streamingAudioCache.clear();

        // 停止当前播放
        if (currentAudio) {
            currentAudio.pause();
            currentAudio = null;
        }

        console.log('流式播放模式已停止');
    }

    /**
     * 生成流式段落音频
     * @param {Object} segment - 段落对象
     * @param {number} index - 段落索引
     */
    async function generateStreamingSegmentAudio(segment, index) {
        const cacheKey = `streaming_${index}_${segment.text.substring(0, 50)}`;

        if (streamingAudioCache.has(cacheKey)) {
            return streamingAudioCache.get(cacheKey);
        }

        try {
            // 构造TTS任务
            const task = {
                dialogue: segment.text,
                character: segment.character || '',
                voice: segment.voice || defaultVoice,
                emotion: segment.emotion || emotion,
                speed: segment.speed || speedFacter
            };

            // 生成音频
            const audioResult = await generateSingleAudio(task);

            if (audioResult && audioResult.url) {
                // 预加载为Blob
                const blobUrl = await fetchAudioBlob(audioResult.url);
                const cachedResult = {
                    ...audioResult,
                    blobUrl: blobUrl,
                    segment: segment,
                    index: index,
                    timestamp: Date.now()
                };

                streamingAudioCache.set(cacheKey, cachedResult);
                console.log(`流式段落 ${index} 音频生成完成`);

                return cachedResult;
            }
        } catch (error) {
            console.error(`生成流式段落 ${index} 音频失败:`, error);
            throw error;
        }
    }

    /**
     * 播放指定的流式段落
     * @param {number} segmentIndex - 段落索引
     */
    async function playStreamingSegment(segmentIndex) {
        if (!isStreamingMode || segmentIndex >= streamingSegments.length) {
            return false;
        }

        const segment = streamingSegments[segmentIndex];
        const cacheKey = `streaming_${segmentIndex}_${segment.text.substring(0, 50)}`;

        let audioData = streamingAudioCache.get(cacheKey);

        // 如果音频还没准备好，先生成
        if (!audioData) {
            try {
                audioData = await generateStreamingSegmentAudio(segment, segmentIndex);
            } catch (error) {
                console.error(`播放流式段落 ${segmentIndex} 失败:`, error);
                return false;
            }
        }

        if (!audioData || !audioData.blobUrl) {
            console.warn(`流式段落 ${segmentIndex} 音频数据无效`);
            return false;
        }

        try {
            // 停止当前播放
            if (currentAudio) {
                currentAudio.pause();
            }

            // 播放音频
            await playAudio(audioData.blobUrl);

            console.log(`播放流式段落 ${segmentIndex}:`, segment.text.substring(0, 30) + '...');

            // 预生成下一个段落
            const nextIndex = segmentIndex + 1;
            if (nextIndex < streamingSegments.length) {
                generateStreamingSegmentAudio(streamingSegments[nextIndex], nextIndex).catch(error => {
                    console.error(`预生成下一段落 ${nextIndex} 失败:`, error);
                });
            }

            return true;
        } catch (error) {
            console.error(`播放流式段落 ${segmentIndex} 失败:`, error);
            return false;
        }
    }

    /**
     * 根据文字进度触发流式播放
     * @param {number} textProgress - 文字显示进度 (0-1)
     */
    function triggerStreamingPlayback(textProgress) {
        if (!isStreamingMode || streamingSegments.length === 0) {
            return;
        }

        // 计算应该播放的段落索引
        const targetIndex = Math.floor(textProgress * streamingSegments.length);

        // 如果需要播放新的段落
        if (targetIndex > currentStreamingIndex && targetIndex < streamingSegments.length) {
            currentStreamingIndex = targetIndex;
            playStreamingSegment(targetIndex).catch(error => {
                console.error('触发流式播放失败:', error);
            });
        }
    }

    /**
     * 获取流式播放状态
     */
    function getStreamingStatus() {
        return {
            isStreamingMode: isStreamingMode,
            currentIndex: currentStreamingIndex,
            totalSegments: streamingSegments.length,
            cachedSegments: streamingAudioCache.size
        };
    }

    // ==================== 内置流式播放系统 ====================

    /**
     * GAL流式播放管理器 - 专为juus本体设计
     */
    const GalStreamingPlayer = {
        // 状态管理
        isActive: false,
        currentSegments: [],
        currentIndex: 0,
        audioCache: new Map(),
        typingProgress: 0,
        totalLength: 0,

        // 配置
        config: {
            segmentDelay: 500, // 段落间延迟
            preloadCount: 2, // 预加载数量
            syncThreshold: 0.1, // 同步阈值
            enableDebug: false // 调试模式
        },

        /**
         * 初始化流式播放
         * @param {Array} galDialogues - GAL对话数组
         */
        async initialize(galDialogues) {
            if (!galDialogues || galDialogues.length === 0) {
                console.warn('GAL流式播放：没有对话数据');
                return false;
            }

            this.isActive = true;
            this.currentSegments = galDialogues;
            this.currentIndex = 0;
            this.audioCache.clear();
            this.typingProgress = 0;

            // 计算总文本长度
            this.totalLength = galDialogues.reduce((sum, dialogue) => {
                return sum + (dialogue.content ? dialogue.content.length : 0);
            }, 0);

            if (this.config.enableDebug) {
                console.log('GAL流式播放初始化:', {
                    segments: galDialogues.length,
                    totalLength: this.totalLength
                });
            }

            // 预生成前几个段落的音频
            await this.preloadSegments(0, Math.min(this.config.preloadCount, galDialogues.length));

            return true;
        },

        /**
         * 预加载音频段落
         * @param {number} startIndex - 开始索引
         * @param {number} count - 预加载数量
         */
        async preloadSegments(startIndex, count) {
            const promises = [];

            for (let i = startIndex; i < Math.min(startIndex + count, this.currentSegments.length); i++) {
                const segment = this.currentSegments[i];
                if (segment && segment.content && !this.audioCache.has(i)) {
                    promises.push(this.generateSegmentAudio(segment, i));
                }
            }

            try {
                await Promise.all(promises);
                if (this.config.enableDebug) {
                    console.log(`预加载完成: ${startIndex} - ${startIndex + count - 1}`);
                }
            } catch (error) {
                console.error('预加载音频失败:', error);
            }
        },

        /**
         * 生成单个段落的音频
         * @param {Object} segment - 段落对象
         * @param {number} index - 段落索引
         */
        async generateSegmentAudio(segment, index) {
            if (!segment.content || this.audioCache.has(index)) {
                return;
            }

            try {
                // 构造TTS任务
                const task = {
                    dialogue: segment.content,
                    character: segment.character || '',
                    voice: this.getVoiceForCharacter(segment.character),
                    emotion: segment.emotion || emotion,
                    speed: speedFacter
                };

                // 生成音频
                const audioResult = await generateSingleAudio(task);

                if (audioResult && audioResult.url) {
                    // 预加载为Blob
                    const blobUrl = await fetchAudioBlob(audioResult.url);

                    this.audioCache.set(index, {
                        ...audioResult,
                        blobUrl: blobUrl,
                        segment: segment,
                        timestamp: Date.now()
                    });

                    if (this.config.enableDebug) {
                        console.log(`段落 ${index} 音频生成完成:`, segment.content.substring(0, 30) + '...');
                    }
                }
            } catch (error) {
                console.error(`生成段落 ${index} 音频失败:`, error);
            }
        },

        /**
         * 根据角色获取语音
         * @param {string} character - 角色名
         * @returns {string} 语音模型
         */
        getVoiceForCharacter(character) {
            if (!character) return defaultVoice;

            // 检查角色语音配置
            if (characterVoices[character]) {
                return characterVoices[character];
            }

            // 检查角色分组
            for (const [groupName, groupData] of Object.entries(characterGroups)) {
                if (groupData.characters && groupData.characters.includes(character)) {
                    return groupData.voice || defaultVoice;
                }
            }

            return defaultVoice;
        },

        /**
         * 更新打字进度并触发播放
         * @param {number} progress - 当前进度 (0-1)
         * @param {number} currentLength - 当前字符长度
         */
        updateProgress(progress, currentLength) {
            if (!this.isActive || this.currentSegments.length === 0) return;

            this.typingProgress = progress;

            // 计算应该播放的段落索引
            const targetIndex = Math.floor(progress * this.currentSegments.length);

            // 如果需要播放新段落
            if (targetIndex > this.currentIndex && targetIndex < this.currentSegments.length) {
                this.playSegment(targetIndex);
            }
        },

        /**
         * 播放指定段落
         * @param {number} index - 段落索引
         */
        async playSegment(index) {
            if (index >= this.currentSegments.length || index < 0) return;

            const cachedAudio = this.audioCache.get(index);

            // 如果音频还没准备好，先生成
            if (!cachedAudio) {
                await this.generateSegmentAudio(this.currentSegments[index], index);
                const newCachedAudio = this.audioCache.get(index);
                if (!newCachedAudio) {
                    console.warn(`段落 ${index} 音频生成失败`);
                    return;
                }
            }

            const audioData = this.audioCache.get(index);
            if (!audioData || !audioData.blobUrl) return;

            try {
                // 停止当前播放
                if (currentAudio) {
                    currentAudio.pause();
                }

                // 播放新音频
                await playAudio(audioData.blobUrl);

                this.currentIndex = index;

                if (this.config.enableDebug) {
                    console.log(`播放段落 ${index}:`, this.currentSegments[index].content.substring(0, 30) + '...');
                }

                // 预加载下一批段落
                const nextStart = index + 1;
                if (nextStart < this.currentSegments.length) {
                    this.preloadSegments(nextStart, this.config.preloadCount);
                }

            } catch (error) {
                console.error(`播放段落 ${index} 失败:`, error);
            }
        },

        /**
         * 停止流式播放
         */
        stop() {
            this.isActive = false;
            this.currentIndex = 0;
            this.typingProgress = 0;

            // 清理音频缓存
            this.audioCache.forEach((audioData) => {
                if (audioData.blobUrl) {
                    URL.revokeObjectURL(audioData.blobUrl);
                }
            });
            this.audioCache.clear();

            // 停止当前播放
            if (currentAudio) {
                currentAudio.pause();
                currentAudio = null;
            }

            if (this.config.enableDebug) {
                console.log('GAL流式播放已停止');
            }
        },

        /**
         * 重置到指定页面
         * @param {number} pageIndex - 页面索引
         */
        resetToPage(pageIndex) {
            this.currentIndex = 0;
            this.typingProgress = 0;

            // 停止当前播放
            if (currentAudio) {
                currentAudio.pause();
                currentAudio = null;
            }

            if (this.config.enableDebug) {
                console.log(`GAL流式播放重置到页面 ${pageIndex}`);
            }
        },

        /**
         * 获取状态信息
         */
        getStatus() {
            return {
                isActive: this.isActive,
                currentIndex: this.currentIndex,
                totalSegments: this.currentSegments.length,
                cachedSegments: this.audioCache.size,
                typingProgress: this.typingProgress,
                config: {
                    ...this.config
                }
            };
        },

        /**
         * 更新配置
         * @param {Object} newConfig - 新配置
         */
        updateConfig(newConfig) {
            this.config = {
                ...this.config,
                ...newConfig
            };

            if (this.config.enableDebug) {
                console.log('GAL流式播放配置已更新:', this.config);
            }
        }
    };

    // ==================== 流式播放功能结束 ====================

    // 单个音频生成（带缓存）
    async function generateSingleAudio(task) {
        // === 原脚本的前置逻辑 (读取共享变量: speedFacter, emotion) ===
        let currentEmotion = task.emotion || emotion; 
    
        const modelDetails = ttsModelsWithDetails[task.voice];
        if (currentEmotion !== '默认' && modelDetails) {
            const lang = detectLanguage(task.dialogue);
            const availableEmotions = modelDetails[lang] || modelDetails[Object.keys(modelDetails)[0]]; 
    
            if (Array.isArray(availableEmotions) && !availableEmotions.includes(currentEmotion)) {
                currentEmotion = '默认'; 
            }
        }
    
        let currentSpeed = speedFacter; 
        if ((detectionMode === 'character_and_dialogue' || detectionMode === 'character_emotion_and_dialogue') && task.character) {
            const characterSetting = characterVoices[task.character];
            if (characterSetting && typeof characterSetting === 'object' && characterSetting.speed) {
                currentSpeed = characterSetting.speed;
            }
        }
        
        const cacheKey = generateCacheKey(task.dialogue, task.voice, {
            emotion: currentEmotion, speedFacter: currentSpeed, ttsApiVersion: task.version || ttsApiVersion
        });
        
        // 缓存检查和并发控制逻辑
        if (audioCache.has(cacheKey) && !task.reInfer) {
            // ... (缓存命中逻辑，如果您的原脚本中有，请保留) ...
        }
        
        while (currentGenerations >= maxConcurrentGenerations) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    
        currentGenerations++;
        // === 原脚本的前置逻辑结束 ===
    
        const generationPromise = new Promise((resolve, reject) => {
            const lang = detectLanguage(task.dialogue);
            
            let requestUrl, requestData, requestHeaders;
            const c = commonInferParams; // 公用推理参数对象 (读取共享变量)
    
            // === 分支逻辑：根据模式构造请求 (读取共享变量: ttsInferMode) ===
            if (ttsInferMode === 'infer_classic') {
                // 1. Classic 模式：使用 FormData (合音兼容，支持文件上传)
                requestUrl = TTS_API_ENDPOINT_INFER_CLASSIC;
                const formData = new FormData();
                
                const p = JchshParams; // 合音独有参数对象 (读取共享变量)
    
                // 处理 refer_wav 文件 (读取共享变量: voiceFile)
                if (voiceFile) {
                    formData.append('refer_wav', voiceFile, voiceFile.name);
                    formData.append('ref_audio_path', voiceFile.name); 
                } else {
                    console.warn('Classic 模式未上传音频文件！请求将可能失败。');
                    formData.append('ref_audio_path', '');
                }
    
                // 填充所有 JSON 参数
                formData.append('text', task.dialogue);
                
                // 使用公用参数 (读取共享变量: commonInferParams)
                formData.append('speed_facter', currentSpeed); 
                formData.append('repetition_penalty', c.repetition_penalty);
                formData.append('temperature', c.temperature);
                formData.append('top_k', c.top_k);
                formData.append('top_p', c.top_p);
                
                // 合音独有参数 (读取共享变量: JchshParams)
                formData.append('version', p.version);
                formData.append('gpt_model_name', p.gpt_model_name);
                formData.append('sovits_model_name', p.sovits_model_name);
                formData.append('prompt_text', p.prompt_text);
                formData.append('prompt_text_lang', p.prompt_text_lang);
                formData.append('text_lang', p.text_lang); 
                formData.append('text_split_method', p.text_split_method);
                formData.append('batch_size', p.batch_size);
                formData.append('batch_threshold', p.batch_threshold);
                formData.append('split_bucket', p.split_bucket); 
                formData.append('fragment_interval', p.fragment_interval);
                formData.append('media_type', p.media_type);
                formData.append('parallel_infer', p.parallel_infer);
                formData.append('seed', p.seed);
                formData.append('sample_steps', p.sample_steps);
                formData.append('if_sr', p.if_sr);
                
                formData.append('model_name', task.voice); 
    
                requestData = formData;
                requestHeaders = {
                    "Authorization": `Bearer ${TTS_BEARER_TOKEN}`
                };
    
            } else {
                // 2. Single 模式：使用 JSON (兼容基础逻辑，使用公用参数覆盖固定值)
                requestUrl = TTS_API_ENDPOINT_INFER; 
                
                // 构建请求体
                const singleParams = {
                    text: task.dialogue,
                    model_name: task.voice,
                    text_lang: lang,
                    prompt_text_lang: lang,
                    version: task.version || ttsApiVersion,
                    dl_url: ttsApiBaseUrl,
                    
                    // === 使用公用推理参数覆盖原脚本写死的值 ===
                    speed_facter: currentSpeed, 
                    repetition_penalty: c.repetition_penalty,
                    temperature: c.temperature,
                    top_k: c.top_k,
                    top_p: c.top_p,
                    // ===========================================
                    
                    // 原脚本中固定或任务相关的参数 
                    batch_size: task.isBatch ? 20 : 10,
                    batch_threshold: 0.75,
                    emotion: currentEmotion,
                    fragment_interval: 0.3,
                    if_sr: false,
                    media_type: "wav",
                    parallel_infer: true,
                    sample_steps: 16,
                    seed: -1,
                    split_bucket: true,
                    text_split_method: "按标点符号切",
                };
    
                requestData = JSON.stringify(singleParams);
                requestHeaders = {
                    "Content-Type": "application/json",
                    "User-Agent": navigator.userAgent,
                    "Accept": "application/json, text/plain, */*",
                    "Cache-Control": "no-cache",
                    "Authorization": `Bearer ${TTS_BEARER_TOKEN}`
                };
            }
    
            // 使用统一的请求函数
            makeRequest(requestUrl, { // 使用根据模式确定的 requestUrl
                method: "POST",
                headers: requestHeaders, // 使用根据模式确定的 requestHeaders
                data: requestData, // 使用根据模式确定的 requestData
                timeout: TTS_GENERATE_TIMEOUT
            }).then(response => {
                currentGenerations--;
                generationPromises.delete(cacheKey);
    
                // 构建详细的日志信息
                const logInfo = {
                    status: response.status,
                    character: task.character || '未知角色',
                    voice: task.voice,
                    emotion: currentEmotion,
                    dialogue: task.dialogue.length > 50 ? task.dialogue.substring(0, 50) + '...' : task.dialogue,
                    fullDialogue: task.dialogue,
                    speed: currentSpeed,
                    timestamp: new Date().toLocaleTimeString()
                };
    
                console.log(`[${logInfo.timestamp}] TTS音频生成响应:`, {
                    '状态码': logInfo.status,
                    '角色': logInfo.character,
                    '语音模型': logInfo.voice,
                    '情绪': logInfo.emotion,
                    '对话内容': logInfo.dialogue,
                    '语速': logInfo.speed,
                    '完整响应': response.responseText
                });
    
                if (response.status === 200) {
                    try {
                        const data = JSON.parse(response.responseText);
                        if (data.audio_url) {
                            const result = {
                                url: data.audio_url,
                                timestamp: Date.now(),
                                task: task
                            };
    
                            audioCache.set(cacheKey, result);
                            cleanupCache();
    
                            // 成功日志
                            console.log(`✅ [${logInfo.timestamp}] TTS生成成功:`, {
                                '角色': logInfo.character,
                                '语音模型': logInfo.voice,
                                '情绪': logInfo.emotion,
                                '对话内容': logInfo.dialogue,
                                '音频URL': data.audio_url,
                                '缓存键': cacheKey.substring(0, 20) + '...'
                            });
    
                            resolve(result);
                        } else {
                            // 失败日志 - API未返回audio_url
                            console.error(`❌ [${logInfo.timestamp}] TTS生成失败 - API未返回audio_url:`, {
                                '角色': logInfo.character,
                                '语音模型': logInfo.voice,
                                '情绪': logInfo.emotion,
                                '对话内容': logInfo.dialogue,
                                '错误原因': data.reason || '未知原因',
                                '完整响应': response.responseText
                            });
                            reject(new Error(data.reason || "API未返回audio_url"));
                        }
                    } catch (e) {
                        // 解析错误日志
                        console.error(`❌ [${logInfo.timestamp}] TTS生成失败 - 解析响应失败:`, {
                            '角色': logInfo.character,
                            '语音模型': logInfo.voice,
                            '情绪': logInfo.emotion,
                            '对话内容': logInfo.dialogue,
                            '解析错误': e.message,
                            '原始响应': response.responseText
                        });
                        reject(new Error("无法解析服务器响应"));
                    }
                } else {
                    // HTTP状态码错误日志
                    console.error(`❌ [${logInfo.timestamp}] TTS生成失败 - HTTP错误:`, {
                        '角色': logInfo.character,
                        '语音模型': logInfo.voice,
                        '情绪': logInfo.emotion,
                        '对话内容': logInfo.dialogue,
                        '状态码': response.status,
                        '状态文本': response.statusText,
                        '完整响应': response.responseText
                    });
                    reject(new Error(`TTS API 错误: ${response.status} ${response.statusText}`));
                }
            }).catch(error => {
                currentGenerations--;
                generationPromises.delete(cacheKey);
    
                // 网络请求错误日志
                console.error(`❌ [${new Date().toLocaleTimeString()}] TTS生成失败 - 网络请求错误:`, {
                    '角色': task.character || '未知角色',
                    '语音模型': task.voice,
                    '情绪': currentEmotion,
                    '对话内容': task.dialogue.length > 50 ? task.dialogue.substring(0, 50) + '...' : task.dialogue,
                    '网络错误': error.message,
                    '错误类型': error.name || '未知错误'
                });
                reject(new Error(`无法连接到TTS服务器: ${error.message}`));
            });
        });
    
        generationPromises.set(cacheKey, generationPromise);
        return await generationPromise;
    }
    

    // 预加载下一个音频
    async function preloadNextAudio() {
        if (!preloadEnabled || playbackQueue.length < 2) return;

        const nextIndex = currentPlaybackIndex + 1;
        if (nextIndex >= playbackQueue.length) return;

        const nextTask = playbackQueue[nextIndex];
        if (nextTask && !nextTask.preloaded) {
            try {
                const blobUrl = await fetchAudioBlob(nextTask.url);
                nextTask.preloadedBlobUrl = blobUrl;
                nextTask.preloaded = true;
            } catch (error) {
                console.warn('预加载失败:', error);
            }
        }
    }

    // 获取音频Blob
    function fetchAudioBlob(url) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url: url,
                responseType: 'blob',
                onload: function(response) {
                    if (response.status === 200) {
                        resolve(URL.createObjectURL(response.response));
                    } else {
                        reject(new Error(`HTTP error! status: ${response.status}`));
                    }
                },
                onerror: function() {
                    reject(new Error('网络请求失败'));
                }
            });
        });
    }

    // 创建美化的UI界面
    function createUI() {
        if (document.getElementById('tts-floating-panel')) return;

        // 创建浮动面板
        const panel = document.createElement('div');
        panel.id = 'tts-floating-panel';
        panel.className = `tts-panel ${edgeMode ? 'edge-mode' : ''}`;

        // 创建主要控制区域
        const mainControls = document.createElement('div');
        mainControls.className = 'tts-main-controls';

        // 播放按钮
        const playBtn = document.createElement('button');
        playBtn.id = 'tts-play-btn';
        playBtn.className = 'tts-control-btn primary';
        playBtn.innerHTML = '<i class="icon">▶</i>';
        playBtn.title = '播放/暂停/继续';
        playBtn.addEventListener('click', handlePlayPauseResumeClick);

        // 停止按钮
        const stopBtn = document.createElement('button');
        stopBtn.id = 'tts-stop-btn';
        stopBtn.className = 'tts-control-btn danger';
        stopBtn.innerHTML = '<i class="icon">⏹</i>';
        stopBtn.title = '停止播放';
        stopBtn.style.display = 'none';
        stopBtn.addEventListener('click', handleStopClick);

        // 重播按钮
        const replayBtn = document.createElement('button');
        replayBtn.id = 'tts-replay-btn';
        replayBtn.className = 'tts-control-btn secondary';
        replayBtn.innerHTML = '<i class="icon">🔄</i>';
        replayBtn.title = '重播上一段';
        replayBtn.disabled = true;
        replayBtn.addEventListener('click', handleReplayClick);

        // 重新推理按钮
        const reinferBtn = document.createElement('button');
        reinferBtn.id = 'tts-reinfer-btn';
        reinferBtn.className = 'tts-control-btn secondary';
        reinferBtn.innerHTML = '<i class="icon">⚡</i>';
        reinferBtn.title = '重新推理';
        reinferBtn.disabled = true;
        reinferBtn.addEventListener('click', handleReinferClick);

        // 前端适配检测按钮
        const frontendDetectBtn = document.createElement('button');
        frontendDetectBtn.id = 'tts-frontend-detect-btn';
        frontendDetectBtn.className = 'tts-control-btn secondary';
        frontendDetectBtn.innerHTML = '<i class="icon">🔍</i>';
        frontendDetectBtn.title = '前端适配检测';
        frontendDetectBtn.addEventListener('click', handleFrontendDetectClick);

        // 设置按钮
        const settingsBtn = document.createElement('button');
        settingsBtn.id = 'tts-settings-btn';
        settingsBtn.className = 'tts-control-btn settings';
        settingsBtn.innerHTML = '<i class="icon">⚙</i>';
        settingsBtn.title = '设置';
        settingsBtn.addEventListener('click', toggleSettingsPanel);

        // 边缘隐藏按钮
        const hideBtn = document.createElement('button');
        hideBtn.id = 'tts-hide-btn';
        hideBtn.className = 'tts-control-btn secondary';
        hideBtn.innerHTML = '<i class="icon">👁</i>';
        hideBtn.title = '边缘隐藏';
        hideBtn.addEventListener('click', toggleEdgeHide);

        mainControls.appendChild(playBtn);
        mainControls.appendChild(stopBtn);
        mainControls.appendChild(replayBtn);
        mainControls.appendChild(reinferBtn);
        mainControls.appendChild(frontendDetectBtn);
        mainControls.appendChild(settingsBtn);
        mainControls.appendChild(hideBtn);

        panel.appendChild(mainControls);

        // 边缘依附功能
        if (edgeMode) {
            panel.classList.add('edge-mode');
            panel.addEventListener('mouseenter', () => {
                panel.classList.add('expanded');
            });
            panel.addEventListener('mouseleave', () => {
                panel.classList.remove('expanded');
            });
        }

        document.body.appendChild(panel);

        // 使面板可拖拽
        makeDraggable(panel);
    }

    // 使面板可拖拽（支持鼠标和触屏）
    function makeDraggable(element) {
        let isDragging = false;
        let startX, startY, startLeft, startTop;

        // 鼠标事件
        element.addEventListener('mousedown', (e) => {
            if (e.target.closest('.tts-control-btn')) return;

            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;
            startLeft = element.offsetLeft;
            startTop = element.offsetTop;

            element.style.cursor = 'move';
            element.classList.add('dragging');

            e.preventDefault();
        });

        // 触屏事件
        element.addEventListener('touchstart', (e) => {
            if (e.target.closest('.tts-control-btn')) return;

            isDragging = true;
            const touch = e.touches[0];
            startX = touch.clientX;
            startY = touch.clientY;
            startLeft = element.offsetLeft;
            startTop = element.offsetTop;

            element.classList.add('dragging');

            e.preventDefault();
        });

        // 鼠标移动
        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;

            const deltaX = e.clientX - startX;
            const deltaY = e.clientY - startY;

            let newLeft = startLeft + deltaX;
            let newTop = startTop + deltaY;

            // 边界检查
            newLeft = Math.max(0, Math.min(newLeft, window.innerWidth - element.offsetWidth));
            newTop = Math.max(0, Math.min(newTop, window.innerHeight - element.offsetHeight));

            element.style.left = newLeft + 'px';
            element.style.top = newTop + 'px';
            element.style.right = 'auto';
            element.style.bottom = 'auto';
        });

        // 触屏移动
        document.addEventListener('touchmove', (e) => {
            if (!isDragging) return;

            const touch = e.touches[0];
            const deltaX = touch.clientX - startX;
            const deltaY = touch.clientY - startY;

            let newLeft = startLeft + deltaX;
            let newTop = startTop + deltaY;

            // 边界检查
            newLeft = Math.max(0, Math.min(newLeft, window.innerWidth - element.offsetWidth));
            newTop = Math.max(0, Math.min(newTop, window.innerHeight - element.offsetHeight));

            element.style.left = newLeft + 'px';
            element.style.top = newTop + 'px';
            element.style.right = 'auto';
            element.style.bottom = 'auto';

            e.preventDefault();
        });

        // 鼠标释放
        document.addEventListener('mouseup', () => {
            if (isDragging) {
                isDragging = false;
                element.style.cursor = '';
                element.classList.remove('dragging');
            }
        });

        // 触屏释放
        document.addEventListener('touchend', () => {
            if (isDragging) {
                isDragging = false;
                element.classList.remove('dragging');
            }
        });
    }

    // 切换设置面板
    function toggleSettingsPanel() {
        const existingPanel = document.getElementById('tts-settings-modal');
        if (existingPanel) {
            existingPanel.remove();
            return;
        }

        createSettingsPanel();
    }

    // 创建设置面板
    function createSettingsPanel() {
        const modal = document.createElement('div');
        modal.id = 'tts-settings-modal';
        modal.className = 'tts-modal';

        const modalContent = document.createElement('div');
        modalContent.className = 'tts-modal-content';

        // 头部
        const header = document.createElement('div');
        header.className = 'tts-modal-header';
        header.innerHTML = `
            <h2>TTS 播放器设置</h2>
            <div class="header-buttons">
                <button id="console-logger-btn" class="tts-header-btn" title="查看控制台日志">
                    <i class="icon">📋</i>
                </button>
                <button id="diagnostic-btn-header" class="tts-header-btn" title="网络诊断">
                    <i class="icon">🔍</i>
                </button>
                <button id="whitelist-manager-header-btn" class="tts-header-btn" title="网址白名单管理">
                    <i class="icon">🌐</i>
                </button>
                <button class="tts-close-btn">×</button>
            </div>
        `;

        // 内容区域
        const body = document.createElement('div');
        body.className = 'tts-modal-body';

        // 基础设置
        body.innerHTML = `
            <div class="tts-setting-section">
                <h3><i class="icon">🔧</i> 基础设置</h3>

                <div class="tts-setting-item">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <label>播放模式状态</label>
                        <span class="version-badge">v18.6(在线版)</span>
                    </div>
                    <div id="settings-status-indicator" class="tts-status-indicator" style="margin-top: 8px;">
                        <div class="status-dot ${autoPlayEnabled ? 'active' : ''}"></div>
                        <span class="status-text">${autoPlayEnabled ? '自动播放模式' : '手动播放模式'}</span>
                    </div>
                    <p class="tts-setting-desc">当前播放模式状态</p>
                </div>

                <div class="tts-setting-item">
                    <label>TTS API 服务器地址</label>
                    <div style="display: flex; gap: 10px; align-items: center;">
                        <input type="text" id="api-base-url" value="${ttsApiBaseUrl}" placeholder="http://127.0.0.1:8000" style="flex: 1;">
                        <button id="test-connection-btn" class="tts-test-btn">测试连接</button>
                    </div>
                    <p class="tts-setting-desc">填入你的TTS服务器地址，格式：http://IP:端口</p>
                </div>

                <div class="tts-setting-item">
                    <label>TTS 鉴权配置</label>
                    <div style="display: flex; gap: 2px; align-items: center; margin-bottom: 8px; width: 100%;">
                        <!-- 选择框 -->
                        <select id="auth-type" style="
                            padding: 6px 8px; 
                            border-radius: 4px; 
                            border: 1px solid #ccc; 
                            width: 90px; 
                            margin-left: 2px; 
                            white-space: nowrap; 
                            overflow: hidden; 
                            text-overflow: ellipsis;
                        ">
                            <option value="none">无需鉴权（本地/无验证）</option>
                            <option value="bearer">Bearer Token</option>
                            <option value="api">API Key（api 前缀）</option>
                            <option value="custom">自定义前缀</option>
                        </select>
                        <!-- 自定义前缀输入框 -->
                        <div style="width: 120px; margin-left: 2px; display: none;" id="custom-prefix-wrap">
                            <input type="text" id="custom-auth-prefix" placeholder="前缀（如 X-API-Key）" style="
                                width: 100%; 
                                padding: 6px 8px; 
                                border-radius: 4px; 
                                border: 1px solid #ccc; 
                                white-space: nowrap; 
                                overflow: hidden; 
                                text-overflow: ellipsis;
                            ">
                        </div>
                        <!-- 输入框 -->
                        <input type="text" id="tts-bearer-token" value="${TTS_BEARER_TOKEN}" placeholder="无需鉴权Token" style="
                            flex: 1; 
                            padding: 6px 8px; 
                            border-radius: 4px; 
                            border: 1px solid #ccc; 
                            min-width: 0; 
                            white-space: nowrap; 
                            overflow: hidden; 
                            text-overflow: ellipsis;
                        ">
                    </div>
                    <p class="tts-setting-desc">
                        本地服务器选「无需鉴权」；需特定前缀（如 X-API-Key）选「自定义前缀」；
                        其他场景选对应类型，输入令牌/Key（自动拼接前缀）
                    </p>
                </div>
                                       
                <div class="tts-setting-item">
                    <label>TTS API 版本</label>
                    <select id="api-version">
                        ${['v2', 'v2Pro', 'v2ProPlus', 'v3', 'v4'].map(v => `<option value="${v}" ${ttsApiVersion === v ? 'selected' : ''}>${v}</option>`).join('')}
                    </select>
                </div>

                <div class="tts-setting-item">
                    <label>TTS 请求超时配置（秒）</label>
                    <!-- 在线API超时 -->
                    <div style="display: flex; gap: 2px; align-items: center; margin-bottom: 8px;">
                        <label style="font-size: 0.9em; white-space: nowrap;">在线API超时</label>
                        <input type="number" id="tts-fetch-timeout" min="10" max="300" value="${TTS_FETCH_TIMEOUT / 1000}" placeholder="120" style="flex: 1; padding: 6px 8px; border-radius: 4px; border: 1px solid #ccc; min-width: 0;">
                    </div>
                    <!-- 合成音频超时 -->
                    <div style="display: flex; gap: 2px; align-items: center;">
                        <label style="font-size: 0.9em; white-space: nowrap;">合成音频超时</label>
                        <input type="number" id="tts-generate-timeout" min="30" max="600" value="${TTS_GENERATE_TIMEOUT / 1000}" placeholder="180" style="flex: 1; padding: 6px 8px; border-radius: 4px; border: 1px solid #ccc; min-width: 0;">
                    </div>
                    <p class="tts-setting-desc">
                        在线API超时：请求服务器的超时时间（建议≥10秒）；<br>
                        合成音频超时：生成音频的超时时间（建议≥30秒）
                    </p>
                </div>
                
                <div class="tts-setting-section" style="border-left: 4px solid #28a745; margin-top: 15px; border-radius: 4px;">
                    <h3><i class="icon">🚀</i> 模式选择</h3>
                    <div class="tts-setting-item">
                        <select id="infer-mode-select" class="tts-select" style="font-weight: bold;">
                            <option value="infer_single">基础模式 (infer_single)</option>
                            <option value="infer_classic">合音模式 (infer_classic)</option>
                        </select>
                        <p class="tts-setting-desc">基础模式使用简单配置；合音模式支持文件上传和高级参数调整。</p>
                    </div>
                </div>
                
                <div class="tts-setting-section" style="border-left: 4px solid #ffc107; border-radius: 4px; padding: 15px; margin: 10px 0; background: #fff; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
                    <h3 style="margin: 0 0 15px 0; font-size: 18px; display: flex; align-items: center; gap: 8px;">
                        <i class="icon">⚙️</i> 公用推理参数
                    </h3>
                    <!-- 网格布局适配移动端（小屏自动1列，大屏2列） -->
                    <div class="tts-settings-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; margin-bottom: 15px;">
                        <div class="tts-setting-item" style="display: flex; flex-direction: column; gap: 4px;">
                            <label style="font-size: 14px; color: #666; font-weight: 500;">Top K</label>
                            <input type="number" id="common_top_k" value="${commonInferParams.top_k || 50}" class="tts-input" 
                                   style="padding: 10px; border: 1px solid #e5e7eb; border-radius: 6px; font-size: 15px; outline: none; transition: border 0.2s;"
                                   min="1" max="100" title="1-100，值越小生成越集中">
                        </div>
                        <div class="tts-setting-item" style="display: flex; flex-direction: column; gap: 4px;">
                            <label style="font-size: 14px; color: #666; font-weight: 500;">Top P</label>
                            <input type="number" id="common_top_p" step="0.01" value="${commonInferParams.top_p || 0.9}" class="tts-input"
                                   style="padding: 10px; border: 1px solid #e5e7eb; border-radius: 6px; font-size: 15px; outline: none; transition: border 0.2s;"
                                   min="0.1" max="1.0" title="0.1-1.0，值越小生成越精准">
                        </div>
                        <div class="tts-setting-item" style="display: flex; flex-direction: column; gap: 4px;">
                            <label style="font-size: 14px; color: #666; font-weight: 500;">Temperature</label>
                            <input type="number" id="common_temperature" step="0.01" value="${commonInferParams.temperature || 0.7}" class="tts-input"
                                   style="padding: 10px; border: 1px solid #e5e7eb; border-radius: 6px; font-size: 15px; outline: none; transition: border 0.2s;"
                                   min="0.1" max="2.0" title="0.1-2.0，值越大生成越随机">
                        </div>
                        <div class="tts-setting-item" style="display: flex; flex-direction: column; gap: 4px;">
                            <label style="font-size: 14px; color: #666; font-weight: 500;">重复惩罚</label>
                            <input type="number" id="common_repetition_penalty" step="0.01" value="${commonInferParams.repetition_penalty || 1.2}" class="tts-input"
                                   style="padding: 10px; border: 1px solid #e5e7eb; border-radius: 6px; font-size: 15px; outline: none; transition: border 0.2s;"
                                   min="1.0" max="2.0" title="1.0-2.0，值越大重复越少">
                        </div>
                    </div>
                    <div class="tts-setting-item" style="display: flex; flex-direction: column; gap: 4px;">
                        <label style="font-size: 14px; color: #666; font-weight: 500;">语速因子 (speedFacter)</label>
                        <input type="number" id="global_speedFacter" step="0.1" value="${speedFacter || 1.0}" class="tts-input"
                               style="padding: 10px; border: 1px solid #e5e7eb; border-radius: 6px; font-size: 15px; outline: none; transition: border 0.2s;"
                               min="0.5" max="3.0" title="0.5-3.0，0.5倍慢，3.0倍快">
                    </div>
                    <!-- 移动端快捷重置按钮 -->
                    <button id="reset-common-params" style="margin-top: 12px; padding: 8px 16px; background: #f3f4f6; border: none; border-radius: 6px; font-size: 14px; color: #333; cursor: pointer; touch-action: manipulation;">
                        🔄 重置为默认值
                    </button>
                </div>
                
                <div id="Jchsh-config-container"></div>

                <div class="tts-setting-item">
                    <label>识别模式</label>
                    <div class="tts-radio-group">
                        <label class="tts-radio-item">
                            <input type="radio" name="detection_mode" value="character_and_dialogue" ${detectionMode === 'character_and_dialogue' ? 'checked' : ''}>
                            <span>【角色】「对话」</span>
                        </label>
                        <label class="tts-radio-item">
                            <input type="radio" name="detection_mode" value="character_emotion_and_dialogue" ${detectionMode === 'character_emotion_and_dialogue' ? 'checked' : ''}>
                            <span>【角色】〈情绪〉「对话」</span>
                        </label>
                        <label class="tts-radio-item">
                            <input type="radio" name="detection_mode" value="emotion_and_dialogue" ${detectionMode === 'emotion_and_dialogue' ? 'checked' : ''}>
                            <span>〈情绪〉「对话」</span>
                        </label>
                        <label class="tts-radio-item">
                            <input type="radio" name="detection_mode" value="narration_and_dialogue" ${detectionMode === 'narration_and_dialogue' ? 'checked' : ''}>
                            <span>旁白与对话</span>
                        </label>
                        <label class="tts-radio-item">
                            <input type="radio" name="detection_mode" value="dialogue_only" ${detectionMode === 'dialogue_only' ? 'checked' : ''}>
                            <span>仅「对话」</span>
                        </label>
                        <label class="tts-radio-item">
                            <input type="radio" name="detection_mode" value="entire_message" ${detectionMode === 'entire_message' ? 'checked' : ''}>
                            <span>朗读整段</span>
                        </label>
                    </div>
                </div>

                <div class="tts-setting-item">
                    <label>引号样式</label>
                    <div class="tts-toggle-group">
                        <label class="tts-toggle-item ${quotationStyle === 'japanese' ? 'active' : ''}">
                            <input type="radio" name="quotation_style" value="japanese" ${quotationStyle === 'japanese' ? 'checked' : ''}>
                            <span>「日式引号」</span>
                        </label>
                        <label class="tts-toggle-item ${quotationStyle === 'western' ? 'active' : ''}">
                            <input type="radio" name="quotation_style" value="western" ${quotationStyle === 'western' ? 'checked' : ''}>
                            <span>"西式引号"</span>
                        </label>
                    </div>
                </div>

                <div class="tts-setting-item">
                    <label>前端美化适配</label>
                    <div class="tts-switch-container">
                        <input type="checkbox" id="frontend-adaptation-toggle" ${frontendAdaptationEnabled ? 'checked' : ''}>
                        <label for="frontend-adaptation-toggle" class="tts-switch">
                            <span class="tts-switch-slider"></span>
                        </label>
                        <span class="tts-switch-text">${frontendAdaptationEnabled ? '已启用' : '已禁用'}</span>
                    </div>
                    <p class="tts-setting-desc">启用后支持从美化的前端界面（如juus本体.html）中提取文本</p>
                </div>
            </div>

            <div class="tts-setting-section">
                <h3><i class="icon">🎮</i> 功能设置</h3>

                <div class="tts-setting-item">
                    <label class="tts-switch-label">
                        <input type="checkbox" id="auto-play-toggle" ${autoPlayEnabled ? 'checked' : ''}>
                        <span class="tts-switch-slider"></span>
                        自动播放新消息
                    </label>
                    <p class="tts-setting-desc">启用后，新消息到达时会自动开始播放</p>
                </div>

                <div class="tts-setting-item">
                    <label class="tts-switch-label">
                        <input type="checkbox" id="edge-mode-toggle" ${edgeMode ? 'checked' : ''}>
                        <span class="tts-switch-slider"></span>
                        边缘依附模式
                    </label>
                    <p class="tts-setting-desc">启用后，工具栏会依附到屏幕边缘，悬停时展开</p>
                </div>


                <div class="tts-setting-item">
                    <label>重新检测消息</label>
                    <button id="big-menu-detect-btn" class="tts-test-btn" style="width: 100%; margin-top: 8px;">
                        <i class="icon">🔍</i> 重新检测当前消息
                    </button>
                    <p class="tts-setting-desc">点击重新检测当前消息并显示详细信息</p>
                </div>

            </div>

            <div class="tts-setting-section">
                <h3><i class="icon">🎤</i> 语音配置</h3>

                <div class="tts-setting-item" id="default-voice-setting">
                    <label>默认语音</label>
                    <select id="default-voice-select">
                        <option value="">» 选择语音模型 «</option>
                        <option value="${DO_NOT_PLAY_VALUE}">🔇 不播放</option>
                    </select>
                </div>

                <div class="tts-setting-item" id="narration-voice-setting" style="display: none;">
                    <label>旁白音色</label>
                    <select id="narration-voice-select">
                        <option value="">» 使用默认 «</option>
                    </select>
                </div>

                <div class="tts-setting-item" id="dialogue-voice-setting" style="display: none;">
                    <label>对话音色</label>
                    <select id="dialogue-voice-select">
                        <option value="">» 使用默认 «</option>
                    </select>
                </div>

                <div class="tts-setting-item">
                    <label>感情</label>
                    <select id="emotion-select">
                        <option value="默认">默认</option>
                    </select>
                </div>

                <div class="tts-setting-item" id="global-speed-setting">
                    <label>全局语速: <span id="speed-value">${speedFacter}</span></label>
                    <input type="range" id="speed-slider" min="0.5" max="2.0" step="0.01" value="${speedFacter}">
                </div>
            </div>

            <div class="tts-setting-section" id="character-groups-section" style="display: none;">
                <h3><i class="icon">🏷️</i> 角色分组管理</h3>
                <div class="tts-setting-item">
                    <div class="tts-group-controls">
                        <input type="text" id="new-group-name" placeholder="输入分组名称（如：尼尔）" maxlength="20">
                        <input type="color" id="new-group-color" value="#667eea" title="选择分组颜色">
                        <button id="add-group-btn" class="tts-add-group-btn">创建分组</button>
                    </div>
                </div>
                <div id="character-groups-container">
                    <p class="tts-empty-state">暂无分组，请先创建分组</p>
                </div>
            </div>

            <div class="tts-setting-section" id="character-voices-section" style="display: none;">
                <h3><i class="icon">👥</i> 角色语音配置</h3>
                <div id="character-voices-container">
                    <p class="tts-empty-state">暂无检测到的角色</p>
                </div>
            </div>
        `;

        modalContent.appendChild(header);
        modalContent.appendChild(body);
        modal.appendChild(modalContent);
        document.body.appendChild(modal);

        // 绑定事件
        bindSettingsEvents();
        updateSettingsVisibility();
        populateVoiceSelects();
        renderCharacterVoices();
        renderCharacterGroups();


        // 点击背景关闭
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.remove();
            }
        });

        // 关闭按钮
        header.querySelector('.tts-close-btn').addEventListener('click', () => {
            modal.remove();
        });

        // 控制台日志按钮
        header.querySelector('#console-logger-btn').addEventListener('click', () => {
            showConsoleLogger();
        });

        // 网络诊断按钮
        header.querySelector('#diagnostic-btn-header').addEventListener('click', () => {
            runDiagnostic();
        });

        // 网址白名单管理按钮
        header.querySelector('#whitelist-manager-header-btn').addEventListener('click', () => {
            showUrlWhitelistManager();
        });
    }


    // 绑定设置事件
    function bindSettingsEvents() {
        // API服务器地址
        document.getElementById('api-base-url').addEventListener('change', (e) => {
            let newUrl = e.target.value.trim();
            if (newUrl.endsWith('/')) {
                newUrl = newUrl.slice(0, -1);
            }
            if (newUrl && !newUrl.match(/^https?:\/\/.+/)) {
                showNotification('请输入有效的URL格式，如：http://127.0.0.1:8000', 'error');
                e.target.value = ttsApiBaseUrl;
                return;
            }
            ttsApiBaseUrl = newUrl || 'http://127.0.0.1:8000';
            updateApiEndpoints();
            Settings.save();
            showNotification('API地址已更新，将在下次获取模型时生效', 'success');
        });

        // 鉴权相关元素获取
        const authTypeSelect = document.getElementById('auth-type');
        const customPrefixInput = document.getElementById('custom-auth-prefix');
        const tokenInput = document.getElementById('tts-bearer-token');

        // 鉴权类型切换逻辑
        authTypeSelect.addEventListener('change', (e) => {
            authType = e.target.value; // 同步到全局变量
            if (authType === 'none') {
                tokenInput.disabled = true;
                tokenInput.placeholder = '无需鉴权则留空';
                customPrefixInput.style.display = 'none';
            } else if (authType === 'custom') {
                tokenInput.disabled = false;
                tokenInput.placeholder = '输入鉴权值（如密钥）';
                customPrefixInput.style.display = 'inline-block';
            } else {
                tokenInput.disabled = false;
                tokenInput.placeholder = '输入鉴权令牌/API Key';
                customPrefixInput.style.display = 'none';
            }
            Settings.save(); // 保存配置
        });

        // Token/Key输入框变化
        tokenInput.addEventListener('change', (e) => {
            TTS_BEARER_TOKEN = e.target.value.trim(); // 同步到全局变量
            Settings.save();
        });

        // 自定义前缀输入框变化
        customPrefixInput.addEventListener('change', (e) => {
            customAuthPrefix = e.target.value.trim(); // 同步到全局变量
            Settings.save();
        });

        // 新增：超时输入框事件
        const fetchTimeoutInput = document.getElementById('tts-fetch-timeout');
        const generateTimeoutInput = document.getElementById('tts-generate-timeout');

        // 在线API超时输入框
        fetchTimeoutInput.addEventListener('change', (e) => {
            let seconds = parseInt(e.target.value.trim());
            // 验证范围（10-300秒）
            if (isNaN(seconds) || seconds < 10 || seconds > 300) {
                showNotification('在线API超时请输入10-300之间的数字', 'error');
                e.target.value = TTS_FETCH_TIMEOUT / 1000;
                return;
            }
            TTS_FETCH_TIMEOUT = seconds * 1000;
            Settings.save();
            showNotification('在线API超时已更新', 'success');
        });

        // 合成音频超时输入框
        generateTimeoutInput.addEventListener('change', (e) => {
            let seconds = parseInt(e.target.value.trim());
            // 验证范围（30-600秒）
            if (isNaN(seconds) || seconds < 30 || seconds > 600) {
                showNotification('合成音频超时请输入30-600之间的数字', 'error');
                e.target.value = TTS_GENERATE_TIMEOUT / 1000;
                return;
            }
            TTS_GENERATE_TIMEOUT = seconds * 1000;
            Settings.save();
            showNotification('合成音频超时已更新', 'success');
        });

        // 测试连接按钮
        document.getElementById('test-connection-btn').addEventListener('click', async () => {
        const btn = document.getElementById('test-connection-btn');
        const originalText = btn.textContent;
        btn.textContent = '测试中...';
        btn.disabled = true;
    
        // 在外面先保存当前配置，避免 try 内早期抛错后在 catch 中无法访问
        const prevApiBaseUrl = ttsApiBaseUrl;
    
        try {
            // 先更新API地址
            const urlInput = document.getElementById('api-base-url');
            let newUrl = urlInput.value.trim();
            if (newUrl.endsWith('/')) {
                newUrl = newUrl.slice(0, -1);
            }
            if (newUrl && !newUrl.match(/^https?:\/\/.+/)) {
                throw new Error('请输入有效的URL格式');
            }
    
            ttsApiBaseUrl = newUrl || 'http://127.0.0.1:8000';
            updateApiEndpoints();
    
            // 测试连接
            await testConnection();
            showNotification('连接测试成功！', 'success');
            Settings.save(); // 保存成功的配置
        } catch (error) {
            showNotification(`连接测试失败：${error.message}`, 'error');
            // 恢复原来的API地址
            ttsApiBaseUrl = prevApiBaseUrl;
            updateApiEndpoints();
        } finally {
            btn.textContent = originalText;
            btn.disabled = false;
        }
    });

        // API版本
        document.getElementById('api-version').addEventListener('change', (e) => {
            ttsApiVersion = e.target.value.trim();
            Settings.save();
            fetchTTSModels();
        });
        
        // ===模式切换逻辑和公用参数绑定 ===
        const inferModeSelect = document.getElementById('infer-mode-select');
        const JchshContainer = document.getElementById('Jchsh-config-container');
        const globalSpeedInput = document.getElementById('global_speedFacter');

        // 1. 绑定公用推理参数 (commonInferParams)
        document.addEventListener('DOMContentLoaded', () => {
            // 精准定位配置容器（避免冲突）
            const container = document.querySelector('.tts-setting-section:has(h3:contains("公用推理参数"))') || document.body;
            if (!container) {
                console.warn('TTS公用参数配置区未找到');
                return;
            }
        
            // 默认参数配置（用于重置）
            const DEFAULT_PARAMS = {
                top_k: 50,
                top_p: 0.9,
                temperature: 0.7,
                repetition_penalty: 1.2,
                speedFacter: 1.0
            };
        
            // 1. 监听 common_ 开头参数变更（带合法性校验）
            container.querySelectorAll('input[id^="common_"]').forEach(input => {
                // 移动端兼容：input 事件实时响应（change 需失焦才触发，体验差）
                input.addEventListener('input', (e) => {
                    const key = e.target.id.replace('common_', '');
                    let value = parseFloat(e.target.value);
                    
                    // 参数范围校验（避免无效值）
                    if (e.target.min) value = Math.max(parseFloat(e.target.min), value);
                    if (e.target.max) value = Math.min(parseFloat(e.target.max), value);
                    // 空值/NaN 重置为默认值
                    if (isNaN(value)) value = DEFAULT_PARAMS[key];
        
                    // 更新变量并保存
                    commonInferParams[key] = value;
                    e.target.value = value; // 同步输入框显示（避免超出范围）
                    Settings.save();
                });
        
                // 移动端触摸优化：聚焦时放大输入框（提升点击精度）
                input.addEventListener('focus', () => {
                    input.style.borderColor = '#ffc107';
                    input.style.transform = 'scale(1.02)';
                    input.style.boxShadow = '0 0 0 2px rgba(255,193,7,0.2)';
                });
                input.addEventListener('blur', () => {
                    input.style.borderColor = '#e5e7eb';
                    input.style.transform = 'scale(1)';
                    input.style.boxShadow = 'none';
                });
            });
        
            // 2. 监听语速因子变更
            const speedInput = container.querySelector('#global_speedFacter');
            if (speedInput) {
                speedInput.addEventListener('input', (e) => {
                    let value = parseFloat(e.target.value);
                    // 范围校验
                    value = Math.max(0.5, Math.min(3.0, value));
                    if (isNaN(value)) value = DEFAULT_PARAMS.speedFacter;
        
                    speedFacter = value;
                    e.target.value = value;
                    Settings.save();
                });
        
                // 同上面的触摸优化
                speedInput.addEventListener('focus', () => {
                    speedInput.style.borderColor = '#ffc107';
                    speedInput.style.transform = 'scale(1.02)';
                    speedInput.style.boxShadow = '0 0 0 2px rgba(255,193,7,0.2)';
                });
                speedInput.addEventListener('blur', () => {
                    speedInput.style.borderColor = '#e5e7eb';
                    speedInput.style.transform = 'scale(1)';
                    speedInput.style.boxShadow = 'none';
                });
            }
        
            // 3. 重置按钮功能（移动端快捷操作）
            const resetBtn = container.querySelector('#reset-common-params');
            if (resetBtn) {
                resetBtn.addEventListener('click', () => {
                    // 重置 common 参数
                    Object.keys(DEFAULT_PARAMS).forEach(key => {
                        if (key !== 'speedFacter') {
                            const input = container.querySelector(`#common_${key}`);
                            if (input) input.value = DEFAULT_PARAMS[key];
                            commonInferParams[key] = DEFAULT_PARAMS[key];
                        }
                    });
                    // 重置语速因子
                    if (speedInput) speedInput.value = DEFAULT_PARAMS.speedFacter;
                    speedFacter = DEFAULT_PARAMS.speedFacter;
        
                    Settings.save();
                    // 移动端反馈（Toast 提示）
                    showToast('已重置为默认参数');
                });
        
                // 按钮触摸反馈
                resetBtn.addEventListener('touchstart', () => {
                    resetBtn.style.background = '#e5e7eb';
                });
                resetBtn.addEventListener('touchend', () => {
                    resetBtn.style.background = '#f3f4f6';
                });
            }
        
            // 辅助：移动端 Toast 提示函数（避免弹窗遮挡）
            function showToast(message) {
                let toast = document.querySelector('.tts-toast');
                if (!toast) {
                    toast = document.createElement('div');
                    toast.className = 'tts-toast';
                    toast.style.cssText = `
                        position: fixed; bottom: 30px; left: 50%; transform: translateX(-50%);
                        padding: 8px 16px; background: rgba(0,0,0,0.7); color: #fff;
                        border-radius: 20px; font-size: 14px; z-index: 9999;
                        transition: opacity 0.3s;
                    `;
                    document.body.appendChild(toast);
                }
                toast.textContent = message;
                toast.style.opacity = '1';
                setTimeout(() => toast.style.opacity = '0', 1500);
            }
        });

        // 2. 绑定原脚本全局变量 speedFacter
        if (globalSpeedInput) {
            globalSpeedInput.addEventListener('change', (e) => {
                // 修改共享变量 speedFacter
                speedFacter = parseFloat(e.target.value); 
                Settings.save(); 
            });
        }

        // 3. 模式切换函数 (控制 合音UI 的显示和事件绑定)
        function toggleJCHSHUI() {
            JchshContainer.innerHTML = ''; 
            if (ttsInferMode === 'infer_classic') {
                const JchshUI = createJCHSHConfigSection();
                JchshContainer.appendChild(JchshUI);
                // 确保在 UI 插入 DOM 后立即绑定事件
                bindJCHSHConfigEvents(JchshUI); 
            }
        }

        if (inferModeSelect) {
            // 初始化时设置选择框的值并显示对应的 UI
            inferModeSelect.value = ttsInferMode;
            toggleJCHSHUI(); 

            inferModeSelect.addEventListener('change', (e) => {
                // 修改共享变量 ttsInferMode
                ttsInferMode = e.target.value;
                Settings.save();
                updateApiEndpoints(); // 刷新 API 地址 (如果将来有变化)
                toggleJCHSHUI(); // 刷新界面
                showNotification(`模式已切换为: ${ttsInferMode}`, 'success');
            });
        }

        // 识别模式
        document.querySelectorAll('input[name="detection_mode"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                detectionMode = e.target.value;
                Settings.save();
                updateSettingsVisibility();
                // 清空缓存的消息部分，强制重新解析
                lastMessageParts = [];
                lastProcessedMessageId = null;
                // 重新解析当前消息
                reparseCurrentMessage();
            });
        });

        // 引号样式
        document.querySelectorAll('input[name="quotation_style"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                quotationStyle = e.target.value;
                Settings.save();
                // 更新切换按钮样式
                document.querySelectorAll('.tts-toggle-item').forEach(item => {
                    item.classList.remove('active');
                });
                e.target.closest('.tts-toggle-item').classList.add('active');
            });
        });

        // 前端美化适配
        document.getElementById('frontend-adaptation-toggle').addEventListener('change', (e) => {
            frontendAdaptationEnabled = e.target.checked;
            Settings.save();
            // 更新开关文本
            const switchText = e.target.parentElement.querySelector('.tts-switch-text');
            if (switchText) {
                switchText.textContent = frontendAdaptationEnabled ? '已启用' : '已禁用';
            }
            // 重新解析当前消息
            reparseCurrentMessage();
        });

        // 自动播放
        document.getElementById('auto-play-toggle').addEventListener('change', (e) => {
            autoPlayEnabled = e.target.checked;
            Settings.save();
            updateStatusIndicator();
        });

        // 边缘模式
        document.getElementById('edge-mode-toggle').addEventListener('change', (e) => {
            edgeMode = e.target.checked;
            Settings.save();
            updateEdgeMode();
        });


        // 大菜单重新检测按钮
        document.getElementById('big-menu-detect-btn').addEventListener('click', async () => {
            const btn = document.getElementById('big-menu-detect-btn');
            const originalText = btn.innerHTML;
            btn.innerHTML = '<i class="icon">⏳</i> 检测中...';
            btn.disabled = true;

            try {
                await handleFrontendDetectClick();
            } finally {
                btn.innerHTML = originalText;
                btn.disabled = false;
            }
        });

        // 语音选择
        document.getElementById('default-voice-select').addEventListener('change', (e) => {
            defaultVoice = e.target.value;
            Settings.save();
            updateEmotionSelect(defaultVoice);
        });

        document.getElementById('narration-voice-select').addEventListener('change', (e) => {
            narrationVoice = e.target.value;
            Settings.save();
            updateEmotionSelect(narrationVoice || defaultVoice);
        });

        document.getElementById('dialogue-voice-select').addEventListener('change', (e) => {
            dialogueVoice = e.target.value;
            Settings.save();
            updateEmotionSelect(dialogueVoice || defaultVoice);
        });

        // 感情选择
        document.getElementById('emotion-select').addEventListener('change', (e) => {
            emotion = e.target.value;
            Settings.save();
        });

        // 语速滑块
        const speedSlider = document.getElementById('speed-slider');
        const speedValue = document.getElementById('speed-value');
        speedSlider.addEventListener('input', (e) => {
            speedValue.textContent = e.target.value;
        });
        speedSlider.addEventListener('change', (e) => {
            speedFacter = parseFloat(e.target.value);
            Settings.save();
        });

        // 分组管理事件
        const addGroupBtn = document.getElementById('add-group-btn');
        if (addGroupBtn) {
            addGroupBtn.addEventListener('click', () => {
                const nameInput = document.getElementById('new-group-name');
                const colorInput = document.getElementById('new-group-color');
                const groupName = nameInput.value.trim();

                if (!groupName) {
                    showNotification('请输入分组名称', 'warning');
                    return;
                }

                if (characterGroups[groupName]) {
                    showNotification('分组名称已存在', 'warning');
                    return;
                }

                characterGroups[groupName] = {
                    characters: [],
                    color: colorInput.value
                };

                Settings.save();
                renderCharacterGroups();
                nameInput.value = '';
                colorInput.value = '#667eea';
                showNotification(`分组 "${groupName}" 创建成功`, 'success');
            });
        }
    }

    // 更新设置面板可见性
    function updateSettingsVisibility() {
        const narrationSetting = document.getElementById('narration-voice-setting');
        const dialogueSetting = document.getElementById('dialogue-voice-setting');
        const characterSection = document.getElementById('character-voices-section');
        const characterGroupsSection = document.getElementById('character-groups-section');
        const defaultSetting = document.getElementById('default-voice-setting');
        const globalSpeedSetting = document.getElementById('global-speed-setting');

        if (narrationSetting && dialogueSetting && characterSection && defaultSetting && characterGroupsSection && globalSpeedSetting) {
            if (detectionMode === 'narration_and_dialogue') {
                narrationSetting.style.display = 'block';
                dialogueSetting.style.display = 'block';
                characterSection.style.display = 'none';
                characterGroupsSection.style.display = 'none';
                defaultSetting.style.display = 'none';
                globalSpeedSetting.style.display = 'block'; // 非角色模式显示全局语速
            } else if (detectionMode === 'character_and_dialogue' || detectionMode === 'character_emotion_and_dialogue') {
                narrationSetting.style.display = 'none';
                dialogueSetting.style.display = 'none';
                characterSection.style.display = 'block';
                characterGroupsSection.style.display = 'block';
                defaultSetting.style.display = 'block';
                globalSpeedSetting.style.display = 'none'; // 角色模式隐藏全局语速
            } else if (detectionMode === 'emotion_and_dialogue') {
                narrationSetting.style.display = 'none';
                dialogueSetting.style.display = 'block';
                characterSection.style.display = 'none';
                characterGroupsSection.style.display = 'none';
                defaultSetting.style.display = 'block';
                globalSpeedSetting.style.display = 'block'; // 非角色模式显示全局语速
            } else {
                narrationSetting.style.display = 'none';
                dialogueSetting.style.display = 'none';
                characterSection.style.display = 'none';
                characterGroupsSection.style.display = 'none';
                defaultSetting.style.display = 'block';
                globalSpeedSetting.style.display = 'block'; // 非角色模式显示全局语速
            }
        }
    }

    // 填充语音选择器
    function populateVoiceSelects() {
        const selects = ['default-voice-select', 'narration-voice-select', 'dialogue-voice-select'];

        selects.forEach(selectId => {
            const select = document.getElementById(selectId);
            if (select) {
                // 清空现有选项（保留默认选项）
                const defaultOptions = select.querySelectorAll('option[value=""], option[value="' + DO_NOT_PLAY_VALUE + '"]');
                select.innerHTML = '';
                defaultOptions.forEach(option => select.appendChild(option));

                // 添加模型选项
                ttsModels.forEach(model => {
                    const option = document.createElement('option');
                    option.value = model;
                    option.textContent = model;
                    select.appendChild(option);
                });

                // 设置当前值
                if (selectId === 'default-voice-select') {
                    select.value = defaultVoice;
                } else if (selectId === 'narration-voice-select') {
                    select.value = narrationVoice;
                } else if (selectId === 'dialogue-voice-select') {
                    select.value = dialogueVoice;
                }
            }
        });
    }

    // 更新感情选择器
    function updateEmotionSelect(modelName) {
        const modelData = ttsModelsWithDetails[modelName];
        // 健壮地获取第一个语言的情感列表，如果没有则返回默认
        const emotions = (modelData && Object.keys(modelData).length > 0) ? modelData[Object.keys(modelData)[0]] : ['默认'];
        populateEmotionSelect(emotions);
    }

    // 填充感情选择器
    function populateEmotionSelect(emotions) {
        const select = document.getElementById('emotion-select');
        if (!select) return;

        const currentEmotion = emotion; // 保存当前感情
        select.innerHTML = ''; // 清空

        emotions.forEach(emo => {
            const option = document.createElement('option');
            option.value = emo;
            option.textContent = emo;
            select.appendChild(option);
        });

        // 尝试恢复之前的感情选项，如果不存在则使用列表中的第一个
        if (emotions.includes(currentEmotion)) {
            select.value = currentEmotion;
        } else {
            select.value = emotions[0] || '默认';
        }

        // 更新全局变量并保存
        if (emotion !== select.value) {
            emotion = select.value;
            Settings.save();
        }
    }

    // 渲染角色语音设置
    async function renderCharacterVoices() {
        const container = document.getElementById('character-voices-container');
        if (!container) return;

        if (allDetectedCharacters.size === 0) {
            container.innerHTML = '<p class="tts-empty-state">暂无检测到的角色</p>';
            return;
        }

        // 获取已分组的角色列表
        const assignedCharacters = new Set();
        Object.values(characterGroups).forEach(group => {
            if (group.characters) {
                group.characters.forEach(char => assignedCharacters.add(char));
            }
        });

        // 只显示未分组的角色
        const unassignedCharacters = Array.from(allDetectedCharacters).filter(char =>
            !assignedCharacters.has(char)
        );

        if (unassignedCharacters.length === 0) {
            container.innerHTML = '<p class="tts-empty-state">所有角色都已分组，请在上方分组中配置语音</p>';
            return;
        }

        container.innerHTML = '';
        for (const char of unassignedCharacters) {
            const charDiv = document.createElement('div');
            charDiv.className = 'tts-character-item';

            const voiceSetting = characterVoices[char];
            const voice = typeof voiceSetting === 'object' ? voiceSetting.voice || '' : voiceSetting || '';
            const version = typeof voiceSetting === 'object' ? voiceSetting.version || ttsApiVersion : ttsApiVersion;
            const speed = typeof voiceSetting === 'object' ? voiceSetting.speed || 1.0 : 1.0;

            const modelsForVersion = await getModelsForVersion(version);

            charDiv.innerHTML = `
                <div class="tts-character-header">
                    <span class="character-name">${char}</span>
                    <button class="tts-delete-char" data-char="${char}">×</button>
                </div>
                <div class="tts-character-controls">
                    <select class="tts-character-version" data-char="${char}">
                        ${['v2', 'v2Pro', 'v2ProPlus', 'v3', 'v4'].map(v => `<option value="${v}" ${version === v ? 'selected' : ''}>${v}</option>`).join('')}
                    </select>
                    <select class="tts-character-voice" data-char="${char}">
                        <option value="">» 使用默认 «</option>
                        <option value="${DO_NOT_PLAY_VALUE}">🔇 不播放</option>
                        ${modelsForVersion.map(model =>
                            `<option value="${model}" ${voice === model ? 'selected' : ''}>${model}</option>`
                        ).join('')}
                    </select>
                    <div class="tts-character-speed-control">
                        <label>语速: <span class="tts-character-speed-value" data-char="${char}">${speed}</span></label>
                        <input type="range" class="tts-character-speed-slider" data-char="${char}" min="0.5" max="2.0" step="0.01" value="${speed}">
                    </div>
                </div>
            `;

            container.appendChild(charDiv);
        }

        // 绑定角色语音事件
        container.querySelectorAll('.tts-character-version').forEach(select => {
            select.addEventListener('change', async (e) => {
                const char = e.target.dataset.char;
                const newVersion = e.target.value;
                const voiceSelect = e.target.closest('.tts-character-controls').querySelector('.tts-character-voice');
                const currentVoice = voiceSelect.value;

                const models = await getModelsForVersion(newVersion);
                voiceSelect.innerHTML = `
                    <option value="">» 使用默认 «</option>
                    <option value="${DO_NOT_PLAY_VALUE}">🔇 不播放</option>
                    ${models.map(model => `<option value="${model}">${model}</option>`).join('')}
                `;

                // 尝试保留原来的语音选择
                if (models.includes(currentVoice)) {
                    voiceSelect.value = currentVoice;
                } else {
                    voiceSelect.value = ''; // 如果新版本没有这个模型，则重置
                }

                // 触发change事件以保存
                voiceSelect.dispatchEvent(new Event('change'));
            });
        });

        container.querySelectorAll('.tts-character-voice').forEach(select => {
            select.addEventListener('change', (e) => {
                const char = e.target.dataset.char;
                const voice = e.target.value;
                const version = e.target.closest('.tts-character-controls').querySelector('.tts-character-version').value;

                if (voice) {
                    characterVoices[char] = {
                        voice,
                        version,
                        speed: characterVoices[char]?.speed || 1.0
                    };
                } else {
                    delete characterVoices[char];
                }
                Settings.save();
                updateEmotionSelect(voice || defaultVoice);
            });
        });

        // 绑定角色语速滑块事件
        container.querySelectorAll('.tts-character-speed-slider').forEach(slider => {
            const char = slider.dataset.char;
            const speedValue = container.querySelector(`.tts-character-speed-value[data-char="${char}"]`);

            slider.addEventListener('input', (e) => {
                speedValue.textContent = e.target.value;
            });

            slider.addEventListener('change', (e) => {
                const speed = parseFloat(e.target.value);
                if (characterVoices[char]) {
                    characterVoices[char].speed = speed;
                } else {
                    characterVoices[char] = {
                        voice: '',
                        version: ttsApiVersion,
                        speed: speed
                    };
                }
                Settings.save();
            });
        });

        container.querySelectorAll('.tts-delete-char').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const char = e.target.dataset.char;
                allDetectedCharacters.delete(char);
                delete characterVoices[char];
                // 从所有分组中移除该角色
                Object.keys(characterGroups).forEach(groupName => {
                    const group = characterGroups[groupName];
                    if (group.characters) {
                        group.characters = group.characters.filter(c => c !== char);
                        if (group.characters.length === 0) {
                            delete characterGroups[groupName];
                        }
                    }
                });
                Settings.save();
                renderCharacterVoices();
                renderCharacterGroups();
            });
        });
    }

    // 渲染角色分组管理
    async function renderCharacterGroups() {
        const container = document.getElementById('character-groups-container');
        if (!container) return;

        const groupNames = Object.keys(characterGroups);
        if (groupNames.length === 0) {
            container.innerHTML = '<p class="tts-empty-state">暂无分组，请先创建分组</p>';
            return;
        }

        container.innerHTML = '';

        for (const groupName of groupNames) {
            const group = characterGroups[groupName];
            const groupDiv = document.createElement('div');
            groupDiv.className = 'tts-group-item';

            // 获取未分组的角色列表
            const assignedCharacters = new Set();
            Object.values(characterGroups).forEach(g => {
                if (g.characters) {
                    g.characters.forEach(char => assignedCharacters.add(char));
                }
            });

            const unassignedCharacters = Array.from(allDetectedCharacters).filter(char =>
                !assignedCharacters.has(char) || (group.characters && group.characters.includes(char))
            );

            groupDiv.innerHTML = `
                <div class="tts-group-header" style="border-left: 4px solid ${group.color}" data-group="${groupName}">
                    <div class="tts-group-info">
                        <span class="tts-group-name">
                            <span class="tts-collapse-icon">▼</span>
                            ${groupName}
                        </span>
                        <span class="tts-group-count">${group.characters ? group.characters.length : 0} 个角色</span>
                    </div>
                    <button class="tts-delete-group" data-group="${groupName}">删除分组</button>
                </div>
                <div class="tts-group-content" style="display: none;">
                    <div class="tts-group-characters">
                        ${group.characters && group.characters.length > 0 ?
                           (await Promise.all(group.characters.map(async char => {
                                const voiceSetting = characterVoices[char];
                                const voice = typeof voiceSetting === 'object' ? voiceSetting.voice || '' : voiceSetting || '';
                                const version = typeof voiceSetting === 'object' ? voiceSetting.version || ttsApiVersion : ttsApiVersion;
                                const speed = typeof voiceSetting === 'object' ? voiceSetting.speed || 1.0 : 1.0;
                                const modelsForVersion = await getModelsForVersion(version);

                                return `
                                    <div class="tts-group-character">
                                        <div class="tts-character-info">
                                            <span class="character-name">${char}</span>
                                            <div class="tts-character-controls-group">
                                                <select class="tts-character-version-in-group" data-char="${char}">
                                                    ${['v2', 'v2Pro', 'v2ProPlus', 'v3', 'v4'].map(v => `<option value="${v}" ${version === v ? 'selected' : ''}>${v}</option>`).join('')}
                                                </select>
                                                <select class="tts-character-voice-in-group" data-char="${char}">
                                                    <option value="">» 使用默认 «</option>
                                                    <option value="${DO_NOT_PLAY_VALUE}" ${voice === DO_NOT_PLAY_VALUE ? 'selected' : ''}>🔇 不播放</option>
                                                    ${modelsForVersion.map(model =>
                                                        `<option value="${model}" ${voice === model ? 'selected' : ''}>${model}</option>`
                                                    ).join('')}
                                                </select>
                                                <div class="tts-character-speed-control">
                                                    <label>语速: <span class="tts-character-speed-value-in-group" data-char="${char}">${speed}</span></label>
                                                    <input type="range" class="tts-character-speed-slider-in-group" data-char="${char}" min="0.5" max="2.0" step="0.01" value="${speed}">
                                                </div>
                                            </div>
                                        </div>
                                        <button class="tts-remove-from-group" data-group="${groupName}" data-char="${char}">移除</button>
                                    </div>
                                `;
                            }))).join('') :
                            '<p class="tts-empty-state">暂无角色</p>'
                        }
                    </div>
                    ${unassignedCharacters.length > 0 ? `
                        <div class="tts-add-character">
                            <select class="tts-character-select" data-group="${groupName}">
                                <option value="">选择要添加的角色</option>
                                ${unassignedCharacters.map(char =>
                                    `<option value="${char}">${char}</option>`
                                ).join('')}
                            </select>
                            <button class="tts-add-to-group" data-group="${groupName}">添加角色</button>
                        </div>
                    ` : ''}
                </div>
            `;

            container.appendChild(groupDiv);
        }

        // 绑定分组管理事件
        bindGroupManagementEvents();
    }

    // 绑定分组管理事件
    function bindGroupManagementEvents() {
        const container = document.getElementById('character-groups-container');
        if (!container) return;

        // 分组折叠/展开功能
        container.querySelectorAll('.tts-group-header').forEach(header => {
            header.addEventListener('click', (e) => {
                if (e.target.closest('.tts-delete-group')) return; // 避免删除按钮触发折叠

                const groupName = header.dataset.group;
                const content = header.nextElementSibling;
                const icon = header.querySelector('.tts-collapse-icon');

                if (content.style.display === 'none') {
                    content.style.display = 'block';
                    icon.textContent = '▼';
                } else {
                    content.style.display = 'none';
                    icon.textContent = '▶';
                }
            });
        });

        // 绑定分组内角色API版本选择事件
        container.querySelectorAll('.tts-character-version-in-group').forEach(select => {
            select.addEventListener('change', async (e) => {
                const char = e.target.dataset.char;
                const newVersion = e.target.value;
                const voiceSelect = e.target.closest('.tts-character-controls-group').querySelector('.tts-character-voice-in-group');
                const currentVoice = voiceSelect.value;

                const models = await getModelsForVersion(newVersion);
                voiceSelect.innerHTML = `
                    <option value="">» 使用默认 «</option>
                    <option value="${DO_NOT_PLAY_VALUE}">🔇 不播放</option>
                    ${models.map(model => `<option value="${model}">${model}</option>`).join('')}
                `;

                if (models.includes(currentVoice)) {
                    voiceSelect.value = currentVoice;
                } else {
                    voiceSelect.value = '';
                }

                voiceSelect.dispatchEvent(new Event('change'));
            });
        });

        // 绑定分组内角色语音选择事件
        container.querySelectorAll('.tts-character-voice-in-group').forEach(select => {
            select.addEventListener('change', (e) => {
                const char = e.target.dataset.char;
                const voice = e.target.value;
                const version = e.target.closest('.tts-character-controls-group').querySelector('.tts-character-version-in-group').value;

                if (voice) {
                    characterVoices[char] = {
                        voice,
                        version,
                        speed: characterVoices[char]?.speed || 1.0
                    };
                } else {
                    delete characterVoices[char];
                }
                Settings.save();
                updateEmotionSelect(voice || defaultVoice);
            });
        });

        // 绑定分组内角色语速滑块事件
        container.querySelectorAll('.tts-character-speed-slider-in-group').forEach(slider => {
            const char = slider.dataset.char;
            const speedValue = container.querySelector(`.tts-character-speed-value-in-group[data-char="${char}"]`);

            slider.addEventListener('input', (e) => {
                speedValue.textContent = e.target.value;
            });

            slider.addEventListener('change', (e) => {
                const speed = parseFloat(e.target.value);
                if (characterVoices[char]) {
                    characterVoices[char].speed = speed;
                } else {
                    characterVoices[char] = {
                        voice: '',
                        version: ttsApiVersion,
                        speed: speed
                    };
                }
                Settings.save();
            });
        });

        // 删除分组
        container.querySelectorAll('.tts-delete-group').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const groupName = e.target.dataset.group;
                if (confirm(`确定要删除分组 "${groupName}" 吗？`)) {
                    delete characterGroups[groupName];
                    Settings.save();
                    renderCharacterGroups();
                    showNotification(`分组 "${groupName}" 已删除`, 'success');
                }
            });
        });

        // 从分组中移除角色
        container.querySelectorAll('.tts-remove-from-group').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const groupName = e.target.dataset.group;
                const charName = e.target.dataset.char;
                const group = characterGroups[groupName];

                if (group && group.characters) {
                    group.characters = group.characters.filter(c => c !== charName);
                    Settings.save();
                    renderCharacterGroups();
                    renderCharacterVoices(); // 更新角色语音配置显示
                    showNotification(`已将 "${charName}" 从分组 "${groupName}" 中移除`, 'success');
                }
            });
        });

        // 添加角色到分组
        container.querySelectorAll('.tts-add-to-group').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const groupName = e.target.dataset.group;
                const select = container.querySelector(`.tts-character-select[data-group="${groupName}"]`);
                const charName = select.value;

                if (!charName) {
                    showNotification('请选择要添加的角色', 'warning');
                    return;
                }

                const group = characterGroups[groupName];
                if (group) {
                    if (!group.characters) {
                        group.characters = [];
                    }

                    // 从其他分组中移除该角色
                    Object.keys(characterGroups).forEach(otherGroupName => {
                        if (otherGroupName !== groupName) {
                            const otherGroup = characterGroups[otherGroupName];
                            if (otherGroup.characters) {
                                otherGroup.characters = otherGroup.characters.filter(c => c !== charName);
                            }
                        }
                    });

                    // 添加到当前分组
                    if (!group.characters.includes(charName)) {
                        group.characters.push(charName);
                    }

                    Settings.save();
                    renderCharacterGroups();
                    showNotification(`已将 "${charName}" 添加到分组 "${groupName}"`, 'success');
                }
            });
        });
    }

    // 更新状态指示器
    function updateStatusIndicator() {
        // 更新设置面板中的状态指示器
        const settingsIndicator = document.getElementById('settings-status-indicator');
        if (settingsIndicator) {
            const dot = settingsIndicator.querySelector('.status-dot');
            const text = settingsIndicator.querySelector('.status-text');

            if (autoPlayEnabled) {
                dot.classList.add('active');
                text.textContent = '自动播放模式';
            } else {
                dot.classList.remove('active');
                text.textContent = '手动播放模式';
            }
        }
    }

    // 更新边缘模式
    function updateEdgeMode() {
        const panel = document.getElementById('tts-floating-panel');
        if (panel) {
            if (edgeMode) {
                panel.classList.add('edge-mode');
                panel.addEventListener('mouseenter', () => {
                    panel.classList.add('expanded');
                });
                panel.addEventListener('mouseleave', () => {
                    panel.classList.remove('expanded');
                });
            } else {
                panel.classList.remove('edge-mode', 'expanded');
            }
        }
    }


    // 检测语言
    function detectLanguage(text) {
        // 1. 检测日文 (包含平假名、片假名和汉字/统一表意文字)
        if (/[ぁ-んァ-ヶ一-龠]/.test(text)) {
            return 'ja';
        }
    
        // 2. 检测英文 (包含拉丁字母)
        if (/[a-zA-Z]/.test(text)) {
            return 'en';
        }
    
        // 3. 默认返回中文 (适用于纯汉字、中文标点等)
        return 'zh';
    }

    // 备用网络请求函数（使用fetch）
    async function makeRequest(url, options = {}) {
        // 优先使用GM_xmlhttpRequest
        if (typeof GM_xmlhttpRequest !== 'undefined') {
            return new Promise((resolve, reject) => {
                const request = GM_xmlhttpRequest({
                    method: options.method || "GET",
                    url: url,
                    headers: options.headers || {},
                    data: options.data,
                    timeout: options.timeout || TTS_FETCH_TIMEOUT,
                    onload: function(response) {
                        resolve(response);
                    },
                    onerror: function(error) {
                        reject(new Error(`GM_xmlhttpRequest失败: ${JSON.stringify(error)}`));
                    },
                    ontimeout: function() {
                        reject(new Error("请求超时"));
                    }
                });

                if (!request) {
                    reject(new Error("无法创建GM_xmlhttpRequest"));
                }
            });
        } else {
            // 备用方案：使用fetch
            console.log("使用fetch作为备用方案");
            const response = await fetch(url, {
                method: options.method || "GET",
                headers: options.headers || {},
                body: options.data,
                mode: 'cors',
                credentials: 'omit'
            });

            // 模拟GM_xmlhttpRequest的响应格式
            const text = await response.text();
            return {
                status: response.status,
                statusText: response.statusText,
                responseText: text
            };
        }
    }
    
    // 获取 GPT 模型列表 
    function fetchJCHSHModelList() {
        const btn = document.getElementById('Jchsh-fetch-models-btn');
        const gptSelect = document.getElementById('Jchsh_param_gpt_model_name');
        if(btn) { btn.disabled = true; btn.textContent = '获取中...'; }
        
        GM_xmlhttpRequest({
            method: "GET",
            // 使用修正后的全局变量
            url: TTS_API_ENDPOINT_INFER_CLASSIC_MODELS, 
            headers: { "accept": "application/json" },
            onload: function(response) {
                try {
                    const data = JSON.parse(response.responseText);
                    let gptCount = 0;
                    
                    // 修改共享变量：JchshGptModels, JchshParams
                    if (data.gpt && Array.isArray(data.gpt)) {
                        JchshGptModels = data.gpt;
                        gptCount = data.gpt.length;
                        if (gptSelect) {
                            gptSelect.innerHTML = '<option value="">请选择 GPT 模型</option>';
                            JchshGptModels.forEach(model => {
                                const option = document.createElement('option');
                                option.value = model;
                                option.textContent = model;
                                if (model === JchshParams.gpt_model_name) option.selected = true;
                                gptSelect.appendChild(option);
                            });
                        }
                    } else {
                        JchshGptModels = [];
                    }
                    
                    showNotification(`成功获取 GPT 模型: ${gptCount}个`, 'success');
                } catch (e) {
                    console.error("解析模型列表失败", e);
                    showNotification("解析模型列表失败", 'error');
                }
            },
            onerror: function(err) {
                showNotification("获取模型列表网络错误", 'error');
            },
            onloadend: function() {
                if(btn) { btn.disabled = false; btn.textContent = '🔄 刷新列表'; }
            }
        });
    }
    
    // 生成 合音配置界面
    function createJCHSHConfigSection() {
        const p = JchshParams;
        const div = document.createElement('div');
        div.className = 'tts-setting-section';
        div.style.marginTop = '15px';
        div.innerHTML = `
            <h3><i class="icon">🎛️</i> 合音模式独有参数 (只用上传音频、参考文本、参考语言跟选择模型，剩下的除非你知道在改什么！)</h3>
            
            <div style="margin-bottom: 10px; padding: 10px; background: #e7f3ff; border: 1px dashed #007bff; border-radius: 6px; text-align: center;">
                <input type="file" id="Jchsh-voiceFileInput" accept="audio/*" style="display: none;">
                <div id="Jchsh-upload-trigger" style="cursor: pointer;">
                    <div style="font-size: 20px;">📂 <span id="Jchsh-file-label">点击上传参考音频 (必需)</span></div>
                </div>
                <div id="Jchsh-file-info" style="display:none; margin-top:5px;">
                    <span id="Jchsh-filename" style="font-weight:bold; color:#0056b3;"></span>
                    <button id="Jchsh-file-remove" style="margin-left:10px; color:red; border:none; background:none; cursor:pointer;">[移除]</button>
                </div>
            </div>

            <div class="tts-setting-item">
                <label>GPT 模型 </label>
                <div style="display:flex; gap:5px;">
                    <select id="Jchsh_param_gpt_model_name" class="tts-select" style="flex:1;">
                        <option value="">${p.gpt_model_name ? p.gpt_model_name : '请点击刷新获取列表'}</option>
                    </select>
                    <button id="Jchsh-fetch-models-btn" class="tts-test-btn" style="width:auto;">🔄 刷新</button>
                </div>
            </div>
            <div class="tts-setting-item">
                <label>SoVITS 模型 (sovits_model_name)</label>
                <input type="text" id="Jchsh_param_sovits_model_name" value="${p.sovits_model_name}" class="tts-input" placeholder="由参考音频决定，此处留空即可">
            </div>

            <div class="tts-settings-grid">
                <div class="tts-setting-item"><label>参考文本(就是上传音频说了什么话)</label><input type="text" id="Jchsh_param_prompt_text" value="${p.prompt_text}" class="tts-input"></div>
                <div class="tts-setting-item"><label>参考文本语言(支持zh,en,ja,ko)</label><input type="text" id="Jchsh_param_prompt_text_lang" value="${p.prompt_text_lang}" class="tts-input"></div>
            </div>

            <div class="tts-settings-grid" style="display: grid; grid-template-columns: 1fr; gap: 20px; padding: 0 5px;">
                <div class="tts-setting-item" style="display: flex; flex-direction: column; gap: 6px;">
                    <label style="font-size: 14px; color: #333; font-weight: 500;">采样步数</label>
                    <input type="number" id="Jchsh_param_sample_steps" value="${p.sample_steps}" 
                           class="tts-input" style="padding: 10px 12px; font-size: 15px; border-radius: 6px; border: 1px solid #ddd; width: 100%; box-sizing: border-box;">
                </div>
                <div class="tts-setting-item" style="display: flex; flex-direction: column; gap: 6px;">
                    <label style="font-size: 14px; color: #333; font-weight: 500;">分段间隔</label>
                    <input type="number" id="Jchsh_param_fragment_interval" step="0.1" value="${p.fragment_interval}" 
                           class="tts-input" style="padding: 10px 12px; font-size: 15px; border-radius: 6px; border: 1px solid #ddd; width: 100%; box-sizing: border-box;">
                </div>
            </div>

            <div style="margin-top:10px; display:flex; flex-wrap:wrap; gap:15px;">
                <label class="tts-switch-label"><input type="checkbox" id="Jchsh_param_split_bucket" ${p.split_bucket ? 'checked' : ''}><span class="tts-switch-slider"></span> Bucket</label>
                <label class="tts-switch-label"><input type="checkbox" id="Jchsh_param_parallel_infer" ${p.parallel_infer ? 'checked' : ''}><span class="tts-switch-slider"></span> 并行推理</label>
                <label class="tts-switch-label"><input type="checkbox" id="Jchsh_param_if_sr" ${p.if_sr ? 'checked' : ''}><span class="tts-switch-slider"></span> 超分 (SR)</label>
            </div>
        `;
        return div;
    }
    
    // 绑定 合音界面事件 (包含文件持久化逻辑)
    function bindJCHSHConfigEvents(container) {
        // 文件上传元素
        const fileInput = container.querySelector('#Jchsh-voiceFileInput');
        const trigger = container.querySelector('#Jchsh-upload-trigger');
        const fileInfo = container.querySelector('#Jchsh-file-info');
        const fileNameSpan = container.querySelector('#Jchsh-filename');
        const removeBtn = container.querySelector('#Jchsh-file-remove');
        const fetchBtn = container.querySelector('#Jchsh-fetch-models-btn');
        const fileLabel = container.querySelector('#Jchsh-file-label');


        // 更新文件 UI 状态 (读取共享变量 voiceFile)
        const updateFileUI = () => {
            if (voiceFile) {
                const fileSizeKB = (voiceFile.size / 1024).toFixed(2);
                fileNameSpan.textContent = `${voiceFile.name} (${fileSizeKB}KB) [已持久化]`;
                fileInfo.style.display = 'block';
                trigger.style.display = 'none';
            } else {
                fileInfo.style.display = 'none';
                trigger.style.display = 'block';
                fileLabel.textContent = '点击上传参考音频 (必需)';
            }
        };
        updateFileUI(); 


        // 文件读取、持久化及更新函数（核心逻辑）
        const saveFileAndSettings = (file) => {
            // 修改共享变量 voiceFile
            voiceFile = file; 

            if (file) {
                const reader = new FileReader();
                reader.onload = function(event) {
                    // 修改共享变量 savedVoiceFileBase64, savedVoiceFileName
                    GM_setValue('savedVoiceFileBase64Online', event.target.result);
                    GM_setValue('savedVoiceFileNameOnline', file.name);
                    Settings.save();
                    updateFileUI();
                    showNotification(`参考音频 ${file.name} 已上传并持久化保存。`, 'success');
                };
                reader.onerror = function(error) {
                    console.error("文件读取失败:", error);
                    showNotification("文件读取失败！", 'error');
                };
                reader.readAsDataURL(file); // 读取为 Base64
            } else {
                // 清除持久化数据
                GM_setValue('savedVoiceFileBase64Online', null);
                GM_setValue('savedVoiceFileNameOnline', null);
                Settings.save();
                updateFileUI();
                showNotification("参考音频已移除。", 'warning');
            }
        };

        // 绑定文件上传事件
        trigger.onclick = () => fileInput.click();
        fileInput.onchange = (e) => { 
            if(e.target.files[0]) { 
                saveFileAndSettings(e.target.files[0]); // 触发新文件的保存和更新
            }
        };
        removeBtn.onclick = () => { 
            fileInput.value = ''; 
            saveFileAndSettings(null); 
        };

        // 绑定刷新模型按钮
        if(fetchBtn) {
            fetchBtn.onclick = () => fetchJCHSHModelList();
            if(JchshGptModels.length === 0 && !JchshParams.gpt_model_name) fetchJCHSHModelList(); 
        }

        // 绑定所有输入框和选择框变化 (合音参数)
        container.querySelectorAll('input, select').forEach(input => {
            input.addEventListener('change', (e) => {
                if(!e.target.id.startsWith('Jchsh_param_')) return;
                
                const key = e.target.id.replace('Jchsh_param_', '');
                let value;
                if (e.target.type === 'checkbox') {
                    value = e.target.checked;
                } else if (e.target.type === 'number') {
                    value = parseFloat(e.target.value);
                } else {
                    value = e.target.value;
                }
                
                // 修改共享变量 JchshParams
                JchshParams[key] = value;
                Settings.save();
            });
        });
    }
    
    // 获取TTS模型列表
    async function fetchTTSModels() {
        try {
            console.log("开始获取TTS模型列表...");
            console.log("请求URL:", TTS_API_ENDPOINT_MODELS);
            console.log("API版本:", ttsApiVersion);

            const response = await makeRequest(TTS_API_ENDPOINT_MODELS, {
                method: "GET",
                headers: {
                    "Content-Type": "application/json",
                    "User-Agent": navigator.userAgent,
                    "Accept": "application/json, text/plain, */*",
                    "Cache-Control": "no-cache"
                },
                timeout: TTS_FETCH_TIMEOUT
            });

            console.log("响应状态:", response.status);
            console.log("响应内容:", response.responseText);

            if (response.status === 200) {
                const data = JSON.parse(response.responseText);
                ttsModelsWithDetails = data.models || {};
                ttsModels = Object.keys(ttsModelsWithDetails);

                if (ttsModels.length > 0 && !defaultVoice) {
                    defaultVoice = ttsModels[0];
                    Settings.save();
                }
                populateVoiceSelects();
                updateEmotionSelect(defaultVoice);

                // 显示成功通知
                showNotification(`成功加载 ${ttsModels.length} 个语音模型`, 'success');
            } else {
                throw new Error(`服务器返回错误状态: ${response.status} ${response.statusText}`);
            }
        } catch (error) {
            console.error("获取TTS模型失败:", error);
            showNotification(`获取语音模型失败: ${error.message}`, 'error');

            // 尝试备用方案：直接测试连接
            testConnection();
        }
    }

    // 测试连接
    async function testConnection() {
        try {
            console.log("开始测试TTS服务连接...");
            const response = await makeRequest(`${ttsApiBaseUrl}/`, {
                method: "GET",
                headers: {
                    "User-Agent": navigator.userAgent,
                    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
                },
                timeout: TTS_FETCH_TIMEOUT
            });

            console.log("连接测试结果:", response.status);
            if (response.status === 200) {
                showNotification("TTS服务连接正常，但模型列表获取失败", 'warning');
            } else {
                showNotification(`TTS服务连接异常: ${response.status}`, 'error');
            }
        } catch (error) {
            console.error("连接测试失败:", error);
            showNotification(`无法连接到TTS服务: ${error.message}`, 'error');
        }
    }

    // 运行网络诊断
    async function runDiagnostic() {
        const diagnosticResults = [];

        showNotification("开始网络诊断...", 'info');

        // 检查GM_xmlhttpRequest是否可用
        if (typeof GM_xmlhttpRequest === 'undefined') {
            diagnosticResults.push(`❌ GM_xmlhttpRequest 不可用 - 这可能是移动端Tampermonkey的限制`);
            diagnosticResults.push(`💡 建议: 尝试使用桌面版Tampermonkey或检查脚本权限`);
        } else {
            diagnosticResults.push(`✅ GM_xmlhttpRequest 可用`);
        }

        // 1. 检查基本网络连接
        try {
            const response = await new Promise((resolve, reject) => {
                const request = GM_xmlhttpRequest({
                    method: "GET",
                    url: "https://www.cloudflare.com/cdn-cgi/trace", // 公共无跨域检测地址（轻量、稳定）
                    headers: {
                        "User-Agent": navigator.userAgent,
                        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
                    },
                    timeout: 5000,
                    onload: function(response) {
                        console.log("基础连接响应:", response);
                        resolve(response);
                    },
                    onerror: function(error) {
                        console.log("基础连接错误:", error);
                        reject(new Error(`网络错误: ${JSON.stringify(error)}`));
                    },
                    ontimeout: function() {
                        console.log("基础连接超时");
                        reject(new Error("连接超时"));
                    }
                });

                // 检查请求是否成功创建
                if (!request) {
                    reject(new Error("无法创建GM_xmlhttpRequest"));
                }
            });

            diagnosticResults.push(`✅ 基础连接: ${response.status} ${response.statusText}`);
        } catch (error) {
            console.error("基础连接测试失败:", error);
            diagnosticResults.push(`❌ 基础连接失败: ${error.message || '未知错误'}`);
        }

        // 2. 检查模型API
        try {
            const response = await new Promise((resolve, reject) => {
                const request = GM_xmlhttpRequest({
                    method: "GET",
                    url: TTS_API_ENDPOINT_MODELS,
                    headers: {
                        "Content-Type": "application/json",
                        "User-Agent": navigator.userAgent,
                        "Accept": "application/json, text/plain, */*"
                    },
                    timeout: TTS_FETCH_TIMEOUT,
                    onload: function(response) {
                        console.log("模型API响应:", response);
                        resolve(response);
                    },
                    onerror: function(error) {
                        console.log("模型API错误:", error);
                        reject(new Error(`API错误: ${JSON.stringify(error)}`));
                    },
                    ontimeout: function() {
                        console.log("模型API超时");
                        reject(new Error("API超时"));
                    }
                });

                if (!request) {
                    reject(new Error("无法创建模型API请求"));
                }
            });

            if (response.status === 200) {
                const data = JSON.parse(response.responseText);
                const modelCount = Object.keys(data.models || {}).length;
                diagnosticResults.push(`✅ 模型API: 成功获取 ${modelCount} 个模型`);
            } else {
                diagnosticResults.push(`❌ 模型API: ${response.status} ${response.statusText}`);
            }
        } catch (error) {
            console.error("模型API测试失败:", error);
            diagnosticResults.push(`❌ 模型API失败: ${error.message || '未知错误'}`);
        }

        // 3. 检查用户代理和浏览器信息
        diagnosticResults.push(`📱 用户代理: ${navigator.userAgent}`);
        diagnosticResults.push(`🌐 平台: ${navigator.platform}`);
        diagnosticResults.push(`📶 在线状态: ${navigator.onLine ? '在线' : '离线'}`);

        // 4. 检查Tampermonkey版本和权限
        if (typeof GM_info !== 'undefined') {
            diagnosticResults.push(`🔧 Tampermonkey: ${GM_info.scriptHandler} ${GM_info.version}`);
            diagnosticResults.push(`🔑 脚本版本: ${GM_info.script.version}`);
        }

        // 5. 检查网络连接类型
        if (navigator.connection) {
            const {
                effectiveType,
                downlink,
                downlinkMax
            } = navigator.connection;
            let networkType = effectiveType || '未知';
            if (downlinkMax >= 100) {
                networkType = '5g';
            } else if (downlinkMax >= 10) {
                networkType = 'wifi';
            } else if (effectiveType === '4g' && downlink < 1) {
                networkType = '3g';
            }
            diagnosticResults.push(`📡 连接类型: ${networkType}`);
            diagnosticResults.push(`📊 连接速度: ${downlink || '未知'} Mbps (最大支持: ${downlinkMax || '未知'} Mbps)`);
        }

        // 6. 尝试使用fetch作为备用方案
        try {
            const response = await fetch(`${ttsApiBaseUrl}/`, {
                method: "GET",
                mode: "no-cors", // 避免CORS问题
                headers: {
                    "User-Agent": navigator.userAgent
                }
            });
            diagnosticResults.push(`✅ Fetch API: 可以访问服务器`);
        } catch (error) {
            diagnosticResults.push(`❌ Fetch API: ${error.message}`);
        }

        // 显示诊断结果
        const resultText = diagnosticResults.join('\n');
        console.log("诊断结果:", resultText);

        // 创建诊断结果弹窗
        const modal = document.createElement('div');
        modal.className = 'tts-modal';
        modal.innerHTML = `
             <div class="tts-modal-content" style="max-width: 600px;">
                <div class="tts-modal-header">
                    <h2><i class="icon">🔍</i> 网络诊断结果</h2>
                    <button class="tts-close-btn">×</button>
                </div>
                <div class="tts-modal-body">
                    <pre style="background: #f8f9fa; padding: 15px; border-radius: 8px; font-size: 12px; white-space: pre-wrap; max-height: 400px; overflow-y: auto;">${resultText}</pre>
                    <div style="margin-top: 15px; text-align: center;">
                        <button onclick="navigator.clipboard.writeText('${resultText.replace(/'/g, "\\'")}'); this.textContent='已复制到剪贴板'; setTimeout(() => this.textContent='复制结果', 2000);" style="padding: 8px 16px; background: #667eea; color: white; border: none; border-radius: 6px; cursor: pointer;">复制结果</button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // 绑定关闭事件
        modal.addEventListener('click', (e) => {
            if (e.target === modal || e.target.classList.contains('tts-close-btn')) {
                modal.remove();
            }
        });

        showNotification("诊断完成，请查看结果", 'success');
    }

    // 边缘隐藏功能
    let isEdgeHidden = false;
    let originalPosition = null;
    let edgeIndicatorLastTop = null;

    function toggleEdgeHide() {
        const panel = document.getElementById('tts-floating-panel');
        if (!panel) return;

        if (isEdgeHidden) {
            // 显示面板
            showPanel();
        } else {
            // 隐藏面板到边缘
            hideToEdge();
        }
    }

    function hideToEdge() {
        const panel = document.getElementById('tts-floating-panel');
        if (!panel) return;

        // 保存当前位置
        const rect = panel.getBoundingClientRect();
        originalPosition = {
            left: panel.style.left,
            top: panel.style.top,
            right: panel.style.right,
            bottom: panel.style.bottom,
            transform: panel.style.transform
        };

        // 移动到右侧边缘（完全隐藏）
        panel.style.left = 'auto';
        panel.style.top = '50%';
        panel.style.right = '-200px';
        panel.style.bottom = 'auto';
        panel.style.transform = 'translateY(-50%)';

        // 添加隐藏状态类
        panel.classList.add('edge-hidden');
        isEdgeHidden = true;

        // 创建小角标指示器
        createEdgeIndicator();

        // 更新按钮图标
        const hideBtn = document.getElementById('tts-hide-btn');
        if (hideBtn) {
            hideBtn.innerHTML = '<i class="icon">👁‍🗨</i>';
            hideBtn.title = '显示面板';
        }

        showNotification('面板已隐藏到边缘，点击右侧角标可显示', 'info');
    }

    function showPanel() {
        const panel = document.getElementById('tts-floating-panel');
        if (!panel) return;

        // 移除角标指示器
        removeEdgeIndicator();

        // 恢复原始位置
        if (originalPosition) {
            panel.style.left = originalPosition.left;
            panel.style.top = originalPosition.top;
            panel.style.right = originalPosition.right;
            panel.style.bottom = originalPosition.bottom;
            panel.style.transform = originalPosition.transform;
        } else {
            // 如果没有原始位置，移动到屏幕中央
            panel.style.left = '50%';
            panel.style.top = '50%';
            panel.style.right = 'auto';
            panel.style.bottom = 'auto';
            panel.style.transform = 'translate(-50%, -50%)';
        }

        // 移除隐藏状态类
        panel.classList.remove('edge-hidden');
        isEdgeHidden = false;

        // 更新按钮图标
        const hideBtn = document.getElementById('tts-hide-btn');
        if (hideBtn) {
            hideBtn.innerHTML = '<i class="icon">👁</i>';
            hideBtn.title = '边缘隐藏';
        }

        showNotification('面板已显示', 'info');
    }

    // 创建边缘角标指示器
    function createEdgeIndicator() {
        // 如果已经存在角标，先移除
        removeEdgeIndicator();

        const indicator = document.createElement('div');
        indicator.id = 'tts-edge-indicator';
        indicator.className = 'tts-edge-indicator';
        indicator.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="18px" height="18px"><path d="M15.707 17.707a1 1 0 0 1-1.414 0L9 12.414l5.293-5.293a1 1 0 0 1 1.414 1.414L11.828 12l3.879 3.879a1 1 0 0 1 0 1.828z"/></svg>`;
        indicator.title = '点击显示TTS面板';

        // 添加到页面
        document.body.appendChild(indicator);

        // 应用上次保存的位置
        if (edgeIndicatorLastTop) {
            indicator.style.top = edgeIndicatorLastTop;
            indicator.style.transform = 'none';
        }

        // 使其可拖拽 (包含点击处理)
        makeIndicatorDraggable(indicator);
    }

    // 移除边缘角标指示器
    function removeEdgeIndicator() {
        const indicator = document.getElementById('tts-edge-indicator');
        if (indicator) {
            indicator.remove();
        }
    }

    // 获取对话正则表达式
    function getDialogueRegex() {
        return quotationStyle === 'western' ? /"([^"]+?)"/g : /「([^」]+?)」/g;
    }

    function getDialogueSplitRegex() {
        return quotationStyle === 'western' ? /("[^"]*")/g : /(「[^」]*」)/g;
    }

    function isDialogueFormat(text) {
        if (quotationStyle === 'western') {
            return text.startsWith('"') && text.endsWith('"');
        } else {
            return text.startsWith('「') && text.endsWith('」');
        }
    }

    function extractDialogue(text) {
        const trimmed = text.trim();
        if (quotationStyle === 'western') {
            return trimmed.startsWith('"') && trimmed.endsWith('"') ?
                trimmed.slice(1, -1).trim() : trimmed;
        } else {
            return trimmed.startsWith('「') && trimmed.endsWith('」') ?
                trimmed.slice(1, -1).trim() : trimmed;
        }
    }

    // ========== 前端美化适配功能 ==========

    // 改进的文本提取函数 - 专门适配juus本体.html的多页面结构
    function extractTextFromElementAdapted(element) {
        if (!element) return '';

        // 调试模式开关
        const debugMode = true;

        if (debugMode) {
            console.log('开始检测元素:', element);
        }

        // 首先检查是否有iframe
        const iframes = element.querySelectorAll('iframe');
        if (iframes.length > 0) {
            if (debugMode) {
                console.log(`发现 ${iframes.length} 个iframe`);
            }

            let iframeText = '';

            for (const iframe of iframes) {
                try {
                    // 获取iframe文档
                    const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;

                    if (iframeDoc && iframeDoc.body) {
                        if (debugMode) {
                            console.log('成功访问iframe文档');
                        }

                        // 专门处理juus本体.html的结构
                        const extractedText = extractFromJuusStructure(iframeDoc);
                        if (extractedText) {
                            iframeText += extractedText;
                        }

                        // 如果juus结构提取失败，尝试其他方法
                        if (!iframeText) {
                            // 查找narrative-text元素（包含主要对话内容）
                            const narrativeElements = iframeDoc.querySelectorAll('.narrative-text');
                            if (narrativeElements.length > 0) {
                                narrativeElements.forEach(elem => {
                                    const text = elem.innerText || elem.textContent;
                                    if (text && text.trim()) {
                                        iframeText += text.trim() + '\n';
                                        if (debugMode) {
                                            console.log('从narrative-text提取到:', text.substring(0, 100) + '...');
                                        }
                                    }
                                });
                            }

                            // 如果没有找到narrative-text，尝试提取整个body
                            if (!iframeText) {
                                const bodyText = iframeDoc.body.innerText || iframeDoc.body.textContent;
                                if (bodyText && bodyText.trim()) {
                                    // 过滤掉一些不需要的内容（如样式、脚本等）
                                    const cleanText = bodyText
                                        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
                                        .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
                                        .trim();

                                    if (cleanText) {
                                        iframeText += cleanText + '\n';
                                        if (debugMode) {
                                            console.log('从iframe body提取到:', cleanText.substring(0, 100) + '...');
                                        }
                                    }
                                }
                            }
                        }
                    }
                } catch (error) {
                    if (debugMode) {
                        console.warn('无法访问iframe内容，可能是跨域问题:', error);
                    }

                    // 尝试从srcdoc属性中提取
                    if (iframe.hasAttribute('srcdoc')) {
                        const srcdoc = iframe.getAttribute('srcdoc');
                        if (srcdoc) {
                            // 创建临时DOM来解析srcdoc内容
                            const tempDiv = document.createElement('div');
                            tempDiv.innerHTML = srcdoc;

                            // 专门处理juus本体.html的结构
                            const extractedText = extractFromJuusStructure(tempDiv);
                            if (extractedText) {
                                iframeText += extractedText;
                            }

                            // 如果juus结构提取失败，尝试其他方法
                            if (!iframeText) {
                                // 查找narrative-text
                                const narrativeElements = tempDiv.querySelectorAll('.narrative-text');
                                if (narrativeElements.length > 0) {
                                    narrativeElements.forEach(elem => {
                                        const text = elem.innerText || elem.textContent;
                                        if (text && text.trim()) {
                                            iframeText += text.trim() + '\n';
                                            if (debugMode) {
                                                console.log('从srcdoc narrative-text提取到:', text.substring(0, 100) + '...');
                                            }
                                        }
                                    });
                                }

                                // 如果没有找到，尝试提取所有文本
                                if (!iframeText) {
                                    const allText = tempDiv.innerText || tempDiv.textContent;
                                    if (allText && allText.trim()) {
                                        iframeText += allText.trim() + '\n';
                                        if (debugMode) {
                                            console.log('从srcdoc提取到:', allText.substring(0, 100) + '...');
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }

            // 如果从iframe中提取到了内容，优先返回iframe内容
            if (iframeText.trim()) {
                const finalText = iframeText.trim();
                if (debugMode) {
                    console.log('最终从iframe提取的文本:', finalText);
                }
                return finalText;
            }
        }

        // 如果没有iframe或iframe内容为空，使用原有逻辑
        const summaryElements = element.querySelectorAll('details summary');
        summaryElements.forEach(summary => {
            summary.style.display = 'none'; // 临时隐藏摘要
        });

        let text = '';
        if (element.innerText && element.innerText.trim()) {
            text = element.innerText.trim();
        } else if (element.textContent && element.textContent.trim()) {
            text = element.textContent.trim();
        }

        // 恢复摘要显示
        summaryElements.forEach(summary => {
            summary.style.display = '';
        });

        // 清理文本
        const cleanedText = text.replace(/\s+/g, ' ').trim();
        return cleanedText;
    }

    // 专门从juus本体.html结构中提取原始文本的函数
    function extractFromJuusStructure(doc) {
        const debugMode = true;

        // 查找所有的dialogue-page
        const dialoguePages = doc.querySelectorAll('.dialogue-page');
        if (dialoguePages.length === 0) {
            if (debugMode) {
                console.log('未找到dialogue-page元素');
            }
            return '';
        }

        if (debugMode) {
            console.log(`找到 ${dialoguePages.length} 个dialogue-page`);
        }

        let fullText = '';

        dialoguePages.forEach((page, pageIndex) => {
            if (debugMode) {
                console.log(`处理第 ${pageIndex + 1} 个dialogue-page`);
            }

            // 查找所有的dialogue-wrapper（包含角色对话）
            const dialogueWrappers = page.querySelectorAll('.dialogue-wrapper');
            dialogueWrappers.forEach(wrapper => {
                // 提取角色名和情绪
                const metaDiv = wrapper.querySelector('.dialogue-meta');
                let character = '';
                let emotion = '';

                if (metaDiv) {
                    const charSpan = metaDiv.querySelector('.dialogue-char');
                    const emoSpan = metaDiv.querySelector('.dialogue-emo');

                    if (charSpan) {
                        character = charSpan.textContent.replace(/【|】/g, '').trim();
                    }
                    if (emoSpan) {
                        emotion = emoSpan.textContent.replace(/〈|〉/g, '').trim();
                    }
                }

                // 提取对话内容
                const dialogueDiv = wrapper.querySelector('.dialogue-text');
                if (dialogueDiv) {
                    const dialogueText = dialogueDiv.dataset.fullText || dialogueDiv.textContent || '';

                    if (dialogueText.trim()) {
                        // 检查是否是引号对话（.dialogue-quote类）
                        const isQuotedDialogue = dialogueDiv.classList.contains('dialogue-quote');

                        // 重建原始格式
                        if (character) {
                            if (emotion) {
                                fullText += `【${character}】〈${emotion}〉「${dialogueText.trim()}」\n`;
                            } else {
                                fullText += `【${character}】「${dialogueText.trim()}」\n`;
                            }
                        } else if (isQuotedDialogue) {
                            // 即使没有角色名，如果是引号对话也要加引号
                            fullText += `「${dialogueText.trim()}」\n`;
                        } else {
                            fullText += `${dialogueText.trim()}\n`;
                        }
                    }
                }
            });

            // 查找所有的普通文本（非对话）
            const textDivs = page.querySelectorAll('.dialogue-text:not(.dialogue-quote)');
            textDivs.forEach(textDiv => {
                // 跳过已经在dialogue-wrapper中处理过的元素
                if (!textDiv.closest('.dialogue-wrapper')) {
                    const text = textDiv.dataset.fullText || textDiv.textContent || '';
                    if (text.trim()) {
                        fullText += `${text.trim()}\n`;
                    }
                }
            });
        });

        // 处理其他可能的文本内容（如状态块、选项等）
        const statusBlock = doc.querySelector('.status-modal');
        if (statusBlock && statusBlock.style.display !== 'none') {
            const statusText = statusBlock.innerText || statusBlock.textContent || '';
            if (statusText.trim()) {
                fullText += `<statusblock>\n${statusText.trim()}\n</statusblock>\n`;
            }
        }

        const optionsModal = doc.querySelector('.options-modal');
        if (optionsModal && optionsModal.style.display !== 'none') {
            const optionButtons = optionsModal.querySelectorAll('.dialogue-option');
            if (optionButtons.length > 0) {
                fullText += '<choice>\n';
                optionButtons.forEach(button => {
                    const optionText = button.textContent || '';
                    if (optionText.trim()) {
                        fullText += `[${optionText.trim()}]\n`;
                    }
                });
                fullText += '</choice>\n';
            }
        }

        return fullText.trim();
    }

    // 等待iframe加载的函数
    async function waitForIframesLoadAdapted(element) {
        return new Promise((resolve) => {
            const iframes = element.querySelectorAll('iframe');
            if (iframes.length === 0) {
                resolve();
                return;
            }

            console.log(`等待 ${iframes.length} 个iframe加载...`);
            let loadedCount = 0;

            const checkAllLoaded = () => {
                loadedCount++;
                if (loadedCount >= iframes.length) {
                    console.log('所有iframe加载完成');
                    resolve();
                }
            };

            iframes.forEach((iframe, index) => {
                if (iframe.hasAttribute('srcdoc')) {
                    console.log('检测到srcdoc iframe，等待渲染...');
                    // srcdoc iframe需要等待内容渲染
                    setTimeout(() => {
                        console.log('srcdoc iframe已就绪');
                        checkAllLoaded();
                    }, 500);
                } else if (iframe.contentDocument && iframe.contentDocument.readyState === 'complete') {
                    checkAllLoaded();
                } else {
                    iframe.addEventListener('load', checkAllLoaded);
                    // 设置超时，避免无限等待
                    setTimeout(checkAllLoaded, 2000);
                }
            });
        });
    }

    // 前端美化适配版的强制检测函数
    async function forceDetectCurrentMessageAdapted() {
        const messages = document.querySelectorAll('div.mes[is_user="false"]');
        if (messages.length === 0) return {
            success: false,
            message: '没有找到AI消息'
        };

        const lastMessageElement = messages[messages.length - 1];
        const messageTextElement = lastMessageElement.querySelector('.mes_text');
        if (!messageTextElement) return {
            success: false,
            message: '消息元素不存在'
        };

        // 等待iframe加载完成
        await waitForIframesLoadAdapted(messageTextElement);

        // 添加额外延迟确保内容渲染
        console.log('等待内容渲染...');
        await new Promise(resolve => setTimeout(resolve, 1000));

        // 使用改进的文本提取方法
        const fullText = extractTextFromElementAdapted(messageTextElement);

        console.log('提取到的完整文本长度:', fullText.length);

        if (!fullText) {
            return {
                success: false,
                message: '消息文本为空'
            };
        }

        return processMessageText(fullText, lastMessageElement);
    }

    // 处理消息文本的通用函数 - 支持所有识别模式
    function processMessageText(fullText, messageElement) {
        const currentMessageParts = [];
        let hasNewCharacter = false;
        let newCharacterCount = 0;
        let actualDialogueCount = 0;
        const validDialogueRegex = /[a-zA-Z0-9\u4e00-\u9fa5\u3040-\u30ff]/;

        console.log('开始处理文本，当前模式:', detectionMode);

        if (detectionMode === 'character_and_dialogue') {
            const regex = /【([^】]+)】「([^」]+?)」/g;
            let match;
            while ((match = regex.exec(fullText)) !== null) {
                const character = match[1].trim();
                const dialogue = match[2].trim();
                console.log(`检测到角色对话: ${character}: ${dialogue.substring(0, 50)}...`);
                if (dialogue && validDialogueRegex.test(dialogue)) {
                    currentMessageParts.push({
                        type: 'character_dialogue',
                        character,
                        dialogue
                    });
                    actualDialogueCount++;
                    if (character && !allDetectedCharacters.has(character)) {
                        allDetectedCharacters.add(character);
                        characterVoices[character] = DO_NOT_PLAY_VALUE;
                        hasNewCharacter = true;
                        newCharacterCount++;
                    }
                }
            }
        } else if (detectionMode === 'character_emotion_and_dialogue') {
            const regex = /【([^】]+)】〈([^〉]+)〉「([^」]+?)」/g;
            let match;
            while ((match = regex.exec(fullText)) !== null) {
                const character = match[1].trim();
                const emotion = match[2].trim();
                const dialogue = match[3].trim();
                console.log(`检测到角色情绪对话: ${character} (${emotion}): ${dialogue.substring(0, 50)}...`);
                if (dialogue && validDialogueRegex.test(dialogue)) {
                    currentMessageParts.push({
                        type: 'character_emotion_dialogue',
                        character,
                        emotion,
                        dialogue
                    });
                    actualDialogueCount++;
                    if (character && !allDetectedCharacters.has(character)) {
                        allDetectedCharacters.add(character);
                        characterVoices[character] = DO_NOT_PLAY_VALUE;
                        hasNewCharacter = true;
                        newCharacterCount++;
                    }
                }
            }
        } else if (detectionMode === 'emotion_and_dialogue') {
            const regex = /〈([^〉]+)〉「([^」]+?)」/g;
            let match;
            while ((match = regex.exec(fullText)) !== null) {
                const emotion = match[1].trim();
                const dialogue = match[2].trim();
                console.log(`检测到情绪对话: (${emotion}): ${dialogue.substring(0, 50)}...`);
                if (dialogue && validDialogueRegex.test(dialogue)) {
                    currentMessageParts.push({
                        type: 'emotion_dialogue',
                        emotion,
                        dialogue
                    });
                    actualDialogueCount++;
                }
            }
        } else if (detectionMode === 'narration_and_dialogue') {
            const segments = fullText.split(getDialogueSplitRegex());
            for (const segment of segments) {
                const trimmedSegment = segment.trim();
                if (!trimmedSegment) continue;

                if (isDialogueFormat(trimmedSegment)) {
                    const dialogue = extractDialogue(trimmedSegment);
                    if (dialogue && validDialogueRegex.test(dialogue)) {
                        console.log(`检测到对话: ${dialogue.substring(0, 50)}...`);
                        currentMessageParts.push({
                            type: 'dialogue',
                            dialogue
                        });
                        actualDialogueCount++;
                    }
                } else {
                    if (validDialogueRegex.test(trimmedSegment)) {
                        console.log(`检测到旁白: ${trimmedSegment.substring(0, 50)}...`);
                        currentMessageParts.push({
                            type: 'narration',
                            dialogue: trimmedSegment
                        });
                    }
                }
            }
        } else if (detectionMode === 'dialogue_only') {
            const regex = getDialogueRegex();
            const allDialogues = [];
            let match;
            while ((match = regex.exec(fullText)) !== null) {
                const dialogue = match[1].trim();
                if (dialogue && validDialogueRegex.test(dialogue)) {
                    console.log(`检测到纯对话: ${dialogue.substring(0, 50)}...`);
                    allDialogues.push(dialogue);
                    actualDialogueCount++;
                }
            }
            if (allDialogues.length > 0) {
                currentMessageParts.push({
                    type: 'dialogue_only',
                    dialogue: allDialogues.join('\n')
                });
            }
        } else if (detectionMode === 'entire_message') {
            const trimmedText = fullText.trim();
            if (trimmedText) {
                console.log(`整段朗读模式，文本长度: ${trimmedText.length}`);
                currentMessageParts.push({
                    type: 'entire_message',
                    dialogue: trimmedText
                });
                actualDialogueCount = 1;
            }
        }

        console.log(`处理完成，共检测到 ${currentMessageParts.length} 个片段，实际对话 ${actualDialogueCount} 条`);

        if (hasNewCharacter) {
            Settings.save();
        }

        // 更新检测结果
        lastMessageParts = currentMessageParts;

        // 生成消息ID
        const messageId = messageElement.getAttribute('mesid') ||
            messageElement.textContent.substring(0, 50) ||
            Date.now().toString();
        lastProcessedMessageId = messageId;

        return {
            success: true,
            totalParts: currentMessageParts.length,
            characterCount: newCharacterCount,
            detectedText: fullText.substring(0, 100) + (fullText.length > 100 ? '...' : ''),
            actualDialogueCount: actualDialogueCount,
            hasNewCharacter: hasNewCharacter
        };
    }

    // ========== 前端美化适配功能结束 ==========

    // 重新解析当前消息
    async function reparseCurrentMessage() {
        // 如果启用了前端美化适配，使用适配版逻辑
        if (frontendAdaptationEnabled) {
            const result = await forceDetectCurrentMessageAdapted();
            const playButton = document.getElementById('tts-play-btn');
            if (playButton) {
                playButton.disabled = !result.success || result.totalParts === 0;
            }
            return;
        }

        // 原有逻辑
        const messages = document.querySelectorAll('div.mes[is_user="false"]');
        if (messages.length === 0) return;

        const lastMessageElement = messages[messages.length - 1];
        const messageTextElement = lastMessageElement.querySelector('.mes_text');
        if (!messageTextElement) return;

        const fullText = messageTextElement.innerText;
        const currentMessageParts = [];
        let hasNewCharacter = false;
        const validDialogueRegex = /[a-zA-Z0-9\u4e00-\u9fa5\u3040-\u30ff]/;

        if (detectionMode === 'character_and_dialogue') {
            const regex = /【([^】]+)】「([^」]+?)」/g;
            let match;
            while ((match = regex.exec(fullText)) !== null) {
                const character = match[1].trim();
                const dialogue = match[2].trim();
                if (dialogue && validDialogueRegex.test(dialogue)) {
                    currentMessageParts.push({
                        type: 'character_dialogue',
                        character,
                        dialogue
                    });
                    if (character && !allDetectedCharacters.has(character)) {
                        allDetectedCharacters.add(character);
                        characterVoices[character] = DO_NOT_PLAY_VALUE;
                        hasNewCharacter = true;
                    }
                }
            }
        } else if (detectionMode === 'character_emotion_and_dialogue') {
            const regex = /【([^】]+)】〈([^〉]+)〉「([^」]+?)」/g;
            let match;
            while ((match = regex.exec(fullText)) !== null) {
                const character = match[1].trim();
                const emotion = match[2].trim();
                const dialogue = match[3].trim();
                if (dialogue && validDialogueRegex.test(dialogue)) {
                    currentMessageParts.push({
                        type: 'character_emotion_dialogue',
                        character,
                        emotion,
                        dialogue
                    });
                    if (character && !allDetectedCharacters.has(character)) {
                        allDetectedCharacters.add(character);
                        characterVoices[character] = DO_NOT_PLAY_VALUE;
                        hasNewCharacter = true;
                    }
                }
            }
        } else if (detectionMode === 'narration_and_dialogue') {
            const segments = fullText.split(getDialogueSplitRegex());
            for (const segment of segments) {
                const trimmedSegment = segment.trim();
                if (!trimmedSegment) continue;

                if (isDialogueFormat(trimmedSegment)) {
                    const dialogue = extractDialogue(trimmedSegment);
                    if (dialogue && validDialogueRegex.test(dialogue)) {
                        currentMessageParts.push({
                            type: 'dialogue',
                            dialogue
                        });
                    }
                } else {
                    if (validDialogueRegex.test(trimmedSegment)) {
                        currentMessageParts.push({
                            type: 'narration',
                            dialogue: trimmedSegment
                        });
                    }
                }
            }
        } else if (detectionMode === 'dialogue_only') {
            const regex = getDialogueRegex();
            const allDialogues = [];
            let match;
            while ((match = regex.exec(fullText)) !== null) {
                const dialogue = match[1].trim();
                if (dialogue && validDialogueRegex.test(dialogue)) {
                    allDialogues.push(dialogue);
                }
            }
            if (allDialogues.length > 0) {
                currentMessageParts.push({
                    type: 'dialogue_only',
                    dialogue: allDialogues.join('\n')
                });
            }
        } else if (detectionMode === 'entire_message') {
            const trimmedText = fullText.trim();
            if (trimmedText) {
                currentMessageParts.push({
                    type: 'entire_message',
                    dialogue: trimmedText
                });
            }
        } else if (detectionMode === 'emotion_and_dialogue') {
            const regex = /〈([^〉]+)〉「([^」]+?)」/g;
            let match;
            while ((match = regex.exec(fullText)) !== null) {
                const emotion = match[1].trim();
                const dialogue = match[2].trim();
                if (dialogue && validDialogueRegex.test(dialogue)) {
                    currentMessageParts.push({
                        type: 'emotion_dialogue',
                        emotion,
                        dialogue
                    });
                }
            }
        }

        if (hasNewCharacter) {
            Settings.save();
        }

        const playButton = document.getElementById('tts-play-btn');
        if (!isPlaying) {
            lastMessageParts = currentMessageParts;
            if (playButton) playButton.disabled = currentMessageParts.length === 0;
        }
    }

    // 观察聊天内容
    function observeChat() {
        const validDialogueRegex = /[a-zA-Z0-9\u4e00-\u9fa5\u3040-\u30ff]/;

        const observerCallback = (mutations, observer) => {
            clearTimeout(observer.debounceTimer);
            observer.debounceTimer = setTimeout(async () => {
                const messages = document.querySelectorAll('div.mes[is_user="false"]');
                if (messages.length === 0) return;

                const lastMessageElement = messages[messages.length - 1];
                const messageTextElement = lastMessageElement.querySelector('.mes_text');
                if (!messageTextElement) return;

                const messageId = lastMessageElement.getAttribute('mesid') ||
                    lastMessageElement.textContent.substring(0, 50);

                if (lastProcessedMessageId === messageId) return;
                lastProcessedMessageId = messageId;

                // 如果启用了前端美化适配，使用适配版逻辑
                if (frontendAdaptationEnabled) {
                    try {
                        const result = await forceDetectCurrentMessageAdapted();
                        const playButton = document.getElementById('tts-play-btn');
                        if (!isPlaying) {
                            if (playButton) playButton.disabled = !result.success || result.totalParts === 0;

                            if (autoPlayEnabled && result.success && result.totalParts > 0) {
                                if (autoPlayTimeout) {
                                    clearTimeout(autoPlayTimeout);
                                    autoPlayTimeout = null;
                                }
                                autoPlayTimeout = setTimeout(() => {
                                    if (!isPlaying && result.totalParts > 0) {
                                        handlePlayPauseResumeClick();
                                    }
                                }, 1000);
                            }
                        }
                    } catch (error) {
                        console.error('前端适配自动检测错误:', error);
                    }
                    return;
                }

                // 原有逻辑
                const fullText = messageTextElement.innerText;
                const currentMessageParts = [];
                let hasNewCharacter = false;

                if (detectionMode === 'character_and_dialogue') {
                    const regex = /【([^】]+)】「([^」]+?)」/g;
                    let match;
                    while ((match = regex.exec(fullText)) !== null) {
                        const character = match[1].trim();
                        const dialogue = match[2].trim();
                        if (dialogue && validDialogueRegex.test(dialogue)) {
                            currentMessageParts.push({
                                type: 'character_dialogue',
                                character,
                                dialogue
                            });
                            if (character && !allDetectedCharacters.has(character)) {
                                allDetectedCharacters.add(character);
                                characterVoices[character] = DO_NOT_PLAY_VALUE;
                                hasNewCharacter = true;
                            }
                        }
                    }
                } else if (detectionMode === 'character_emotion_and_dialogue') {
                    const regex = /【([^】]+)】〈([^〉]+)〉「([^」]+?)」/g;
                    let match;
                    while ((match = regex.exec(fullText)) !== null) {
                        const character = match[1].trim();
                        const emotion = match[2].trim();
                        const dialogue = match[3].trim();
                        if (dialogue && validDialogueRegex.test(dialogue)) {
                            currentMessageParts.push({
                                type: 'character_emotion_dialogue',
                                character,
                                emotion,
                                dialogue
                            });
                            if (character && !allDetectedCharacters.has(character)) {
                                allDetectedCharacters.add(character);
                                characterVoices[character] = DO_NOT_PLAY_VALUE;
                                hasNewCharacter = true;
                            }
                        }
                    }
                } else if (detectionMode === 'narration_and_dialogue') {
                    const segments = fullText.split(getDialogueSplitRegex());
                    for (const segment of segments) {
                        const trimmedSegment = segment.trim();
                        if (!trimmedSegment) continue;

                        if (isDialogueFormat(trimmedSegment)) {
                            const dialogue = extractDialogue(trimmedSegment);
                            if (dialogue && validDialogueRegex.test(dialogue)) {
                                currentMessageParts.push({
                                    type: 'dialogue',
                                    dialogue
                                });
                            }
                        } else {
                            if (validDialogueRegex.test(trimmedSegment)) {
                                currentMessageParts.push({
                                    type: 'narration',
                                    dialogue: trimmedSegment
                                });
                            }
                        }
                    }
                } else if (detectionMode === 'dialogue_only') {
                    const regex = getDialogueRegex();
                    const allDialogues = [];
                    let match;
                    while ((match = regex.exec(fullText)) !== null) {
                        const dialogue = match[1].trim();
                        if (dialogue && validDialogueRegex.test(dialogue)) {
                            allDialogues.push(dialogue);
                        }
                    }
                    if (allDialogues.length > 0) {
                        currentMessageParts.push({
                            type: 'dialogue_only',
                            dialogue: allDialogues.join('\n')
                        });
                    }
                } else if (detectionMode === 'entire_message') {
                    const trimmedText = fullText.trim();
                    if (trimmedText) {
                        currentMessageParts.push({
                            type: 'entire_message',
                            dialogue: trimmedText
                        });
                    }
                } else if (detectionMode === 'emotion_and_dialogue') {
                    const regex = /〈([^〉]+)〉「([^」]+?)」/g;
                    let match;
                    while ((match = regex.exec(fullText)) !== null) {
                        const emotion = match[1].trim();
                        const dialogue = match[2].trim();
                        if (dialogue && validDialogueRegex.test(dialogue)) {
                            currentMessageParts.push({
                                type: 'emotion_dialogue',
                                emotion,
                                dialogue
                            });
                        }
                    }
                }

                if (hasNewCharacter) {
                    Settings.save();
                }

                const playButton = document.getElementById('tts-play-btn');
                if (!isPlaying) {
                    lastMessageParts = currentMessageParts;
                    if (playButton) playButton.disabled = currentMessageParts.length === 0;

                    if (autoPlayTimeout) {
                        clearTimeout(autoPlayTimeout);
                        autoPlayTimeout = null;
                    }

                    if (autoPlayEnabled && currentMessageParts.length > 0) {
                        autoPlayTimeout = setTimeout(() => {
                            if (!isPlaying && lastProcessedMessageId === messageId) {
                                handlePlayPauseResumeClick();
                            }
                            autoPlayTimeout = null;
                        }, 800);
                    }
                }
            }, 300);
        };

        const observer = new MutationObserver(observerCallback);
        observer.callback = observerCallback;

        const interval = setInterval(() => {
            const chatContainer = document.querySelector('#chat');
            if (chatContainer) {
                observer.observe(chatContainer, {
                    childList: true,
                    subtree: true
                });
                clearInterval(interval);
                observer.callback(null, observer);
            }
        }, 500);
    }

    // 播放音频
    function playAudio(blobUrl) {
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
                if (isPlaying) {
                    reject(new Error("音频播放失败"));
                }
            };
            const cleanup = () => {
                URL.revokeObjectURL(blobUrl);
                if (currentAudio) {
                    currentAudio.removeEventListener('ended', onEnded);
                    currentAudio.removeEventListener('error', onError);
                }
            };

            currentAudio.addEventListener('ended', onEnded);
            currentAudio.addEventListener('error', onError);

            currentAudio.src = blobUrl;
            currentAudio.play().catch(onError);
        });
    }

    // 处理播放/暂停/继续点击
    function handlePlayPauseResumeClick() {
        const playButton = document.getElementById('tts-play-btn');

        if (isPlaying && !isPaused) {
            isPaused = true;
            if (currentAudio) currentAudio.pause();
            updatePlayButton('▶', '继续');
            return;
        }

        if (isPlaying && isPaused) {
            isPaused = false;
            updatePlayButton('⏸', '暂停');
            if (currentAudio) {
                currentAudio.play();
            } else {
                processPlaybackQueue();
            }
            return;
        }

        if (ttsModels.length === 0) {
            showNotification("播放失败：无法连接到TTS服务或未找到任何语音模型。", 'error');
            return;
        }

        if (lastMessageParts.length === 0) {
            showNotification("未找到符合当前识别模式的文本。", 'warning');
            return;
        }

        const tasksToGenerate = lastMessageParts.map(part => {
            let voice = '';
            let version = ttsApiVersion;
            let taskEmotion = null;
            let voiceSetting;

            switch (part.type) {
                case 'character_emotion_dialogue':
                    voiceSetting = characterVoices[part.character];
                    if (typeof voiceSetting === 'object') {
                        voice = voiceSetting.voice || defaultVoice;
                        version = voiceSetting.version || ttsApiVersion;
                    } else {
                        voice = voiceSetting || defaultVoice;
                    }
                    taskEmotion = part.emotion;
                    break;
                case 'emotion_dialogue':
                    voice = dialogueVoice || defaultVoice;
                    taskEmotion = part.emotion;
                    break;
                case 'character_dialogue':
                    voiceSetting = characterVoices[part.character];
                    if (typeof voiceSetting === 'object') {
                        voice = voiceSetting.voice || defaultVoice;
                        version = voiceSetting.version || ttsApiVersion;
                    } else {
                        voice = voiceSetting || defaultVoice;
                    }
                    break;
                case 'narration':
                    voice = narrationVoice || defaultVoice;
                    break;
                case 'dialogue':
                    voice = dialogueVoice || defaultVoice;
                    break;
                case 'dialogue_only':
                case 'entire_message':
                    voice = defaultVoice;
                    break;
            }
            if (voice && voice !== DO_NOT_PLAY_VALUE) {
                return {
                    dialogue: part.dialogue,
                    voice: voice,
                    version: version,
                    emotion: taskEmotion,
                    character: part.character
                };
            }
            return null;
        }).filter(Boolean);

        if (tasksToGenerate.length === 0) {
            showNotification("没有需要播放的对话内容（请检查语音配置）。", 'warning');
            return;
        }

        isPlaying = true;
        isPaused = false;
        generationQueue = [...tasksToGenerate];
        playbackQueue = [];
        currentPlaybackIndex = 0; // 重置播放索引
        document.getElementById('tts-stop-btn').style.display = 'inline-block';
        document.getElementById('tts-replay-btn').disabled = true;
        document.getElementById('tts-reinfer-btn').disabled = true;

        processGenerationQueue();
    }

    // 处理停止点击
    function handleStopClick() {
        isPlaying = false;
        isPaused = false;
        generationQueue = [];
        playbackQueue = [];

        // 重置播放状态
        isProcessingQueue = false;
        currentPlaybackIndex = 0;
        playbackSequenceId++;

        if (autoPlayTimeout) {
            clearTimeout(autoPlayTimeout);
            autoPlayTimeout = null;
        }

        if (currentAudio) {
            currentAudio.pause();
            currentAudio.src = '';
            currentAudio = null;
        }

        updatePlayButton('▶', '播放');
        document.getElementById('tts-play-btn').disabled = lastMessageParts.length === 0;
        document.getElementById('tts-stop-btn').style.display = 'none';
        document.getElementById('tts-replay-btn').disabled = lastPlayedQueue.length === 0;
        document.getElementById('tts-reinfer-btn').disabled = lastPlayedQueue.length === 0;
    }

    // 处理重播点击
    function handleReplayClick() {
        if (lastPlayedQueue.length === 0 || isPlaying) return;
        handleStopClick();
        playbackQueue = [...lastPlayedQueue];
        currentPlaybackIndex = 0; // 重置播放索引
        isPlaying = true;
        isPaused = false;
        updatePlayButton('⏸', '暂停');
        document.getElementById('tts-stop-btn').style.display = 'inline-block';
        document.getElementById('tts-replay-btn').disabled = true;
        document.getElementById('tts-reinfer-btn').disabled = true;
        processPlaybackQueue();
    }

    // 创建检测信息弹窗
    function createDetectionInfoPopup(detectionLogs) {
        const modal = document.createElement('div');
        modal.id = 'tts-detection-info-modal';
        modal.className = 'tts-modal';
        modal.style.zIndex = '10001';

        const modalContent = document.createElement('div');
        modalContent.className = 'tts-modal-content';
        modalContent.style.maxWidth = '800px';
        modalContent.style.maxHeight = '600px';

        // 头部
        const header = document.createElement('div');
        header.className = 'tts-modal-header';
        header.innerHTML = `
            <h2><i class="icon">🔍</i> 检测信息详情</h2>
            <button class="tts-close-btn">×</button>
        `;

        // 内容区域
        const body = document.createElement('div');
        body.className = 'tts-modal-body';
        body.style.maxHeight = '500px';
        body.style.overflowY = 'auto';

        // 检测日志内容
        const logsHtml = detectionLogs.map(log => {
            if (log.includes('提取到的完整文本长度:')) {
                return `<div class="tts-detection-log-item tts-detection-summary">
                    <strong>${log}</strong>
                </div>`;
            } else if (log.includes('开始处理文本')) {
                return `<div class="tts-detection-log-item tts-detection-start">
                    <strong>${log}</strong>
                </div>`;
            } else if (log.includes('检测到纯对话:')) {
                return `<div class="tts-detection-log-item tts-detection-dialogue">
                    ${log}
                </div>`;
            } else if (log.includes('检测到角色对话:')) {
                return `<div class="tts-detection-log-item tts-detection-character">
                    ${log}
                </div>`;
            } else if (log.includes('检测到角色情绪对话:')) {
                return `<div class="tts-detection-log-item tts-detection-emotion">
                    ${log}
                </div>`;
            } else if (log.includes('检测到情绪对话:')) {
                return `<div class="tts-detection-log-item tts-detection-emotion">
                    ${log}
                </div>`;
            } else if (log.includes('检测到对话:')) {
                return `<div class="tts-detection-log-item tts-detection-dialogue">
                    ${log}
                </div>`;
            } else if (log.includes('检测到旁白:')) {
                return `<div class="tts-detection-log-item tts-detection-narration">
                    ${log}
                </div>`;
            } else {
                return `<div class="tts-detection-log-item tts-detection-other">
                    ${log}
                </div>`;
            }
        }).join('');

        body.innerHTML = `
            <div class="tts-detection-info-container">
                <div class="tts-detection-logs">
                    ${logsHtml}
                </div>
            </div>
        `;

        modalContent.appendChild(header);
        modalContent.appendChild(body);
        modal.appendChild(modalContent);
        document.body.appendChild(modal);

        // 添加样式
        const style = document.createElement('style');
        style.textContent = `
            .tts-detection-info-container {
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            }
            .tts-detection-logs {
                display: flex;
                flex-direction: column;
                gap: 8px;
            }
            .tts-detection-log-item {
                padding: 8px 12px;
                border-radius: 6px;
                font-size: 13px;
                line-height: 1.4;
                word-break: break-all;
            }
            .tts-detection-summary {
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                font-weight: bold;
            }
            .tts-detection-start {
                background: #e3f2fd;
                color: #1976d2;
                border-left: 4px solid #2196f3;
            }
            .tts-detection-dialogue {
                background: #f3e5f5;
                color: #7b1fa2;
                border-left: 4px solid #9c27b0;
            }
            .tts-detection-character {
                background: #e8f5e8;
                color: #2e7d32;
                border-left: 4px solid #4caf50;
            }
            .tts-detection-emotion {
                background: #fff3e0;
                color: #f57c00;
                border-left: 4px solid #ff9800;
            }
            .tts-detection-narration {
                background: #fce4ec;
                color: #c2185b;
                border-left: 4px solid #e91e63;
            }
            .tts-detection-other {
                background: #f5f5f5;
                color: #424242;
                border-left: 4px solid #9e9e9e;
            }
        `;
        document.head.appendChild(style);

        // 点击背景关闭
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.remove();
                style.remove();
            }
        });

        // 关闭按钮
        header.querySelector('.tts-close-btn').addEventListener('click', () => {
            modal.remove();
            style.remove();
        });

        return modal;
    }

    // 处理前端适配检测点击
    async function handleFrontendDetectClick() {
        if (isPlaying) {
            showNotification("正在播放中，请先停止。", 'info');
            return;
        }

        try {
            showNotification("正在使用前端适配模式检测...", 'info');

            // 捕获控制台日志
            const originalLog = console.log;
            const detectionLogs = [];
            console.log = function(...args) {
                const message = args.join(' ');
                if (message.includes('提取到的完整文本长度:') ||
                    message.includes('开始处理文本') ||
                    message.includes('检测到纯对话:') ||
                    message.includes('检测到角色对话:') ||
                    message.includes('检测到角色情绪对话:') ||
                    message.includes('检测到情绪对话:') ||
                    message.includes('检测到对话:') ||
                    message.includes('检测到旁白:')) {
                    detectionLogs.push(message);
                }
                originalLog.apply(console, args);
            };

            const result = await forceDetectCurrentMessageAdapted();

            // 恢复原始console.log
            console.log = originalLog;

            if (result.success) {
                showNotification(`前端适配检测成功！检测到 ${result.totalParts} 个语音片段。`, 'success');

                // 显示检测信息弹窗
                createDetectionInfoPopup(detectionLogs);

                // 更新播放按钮状态
                const playButton = document.getElementById('tts-play-btn');
                if (playButton) {
                    playButton.disabled = result.totalParts === 0;
                }
            } else {
                showNotification(`前端适配检测失败：${result.message}`, 'error');
            }
        } catch (error) {
            console.error('前端适配检测错误:', error);
            showNotification(`前端适配检测出错：${error.message}`, 'error');
        }
    }

    // 处理重新推理点击
    function handleReinferClick() {
        if (isPlaying) {
            showNotification("正在播放中，请先停止。", 'info');
            return;
        }
        if (lastMessageParts.length === 0) {
            showNotification("没有可重新推理的内容。", 'warning');
            return;
        }
        if (ttsModels.length === 0) {
            showNotification("重新推理失败：无法连接到TTS服务或未找到任何语音模型。", 'error');
            return;
        }
        const tasksToGenerate = lastMessageParts.map(part => {
            let voice = '';
            let version = ttsApiVersion;
            let taskEmotion = null;
            let voiceSetting;

            switch (part.type) {
                case 'character_emotion_dialogue':
                    voiceSetting = characterVoices[part.character];
                    if (typeof voiceSetting === 'object') {
                        voice = voiceSetting.voice || defaultVoice;
                        version = voiceSetting.version || ttsApiVersion;
                    } else {
                        voice = voiceSetting || defaultVoice;
                    }
                    taskEmotion = part.emotion;
                    break;
                case 'emotion_dialogue':
                    voice = dialogueVoice || defaultVoice;
                    taskEmotion = part.emotion;
                    break;
                case 'character_dialogue':
                    voiceSetting = characterVoices[part.character];
                    if (typeof voiceSetting === 'object') {
                        voice = voiceSetting.voice || defaultVoice;
                        version = voiceSetting.version || ttsApiVersion;
                    } else {
                        voice = voiceSetting || defaultVoice;
                    }
                    break;
                case 'narration':
                    voice = narrationVoice || defaultVoice;
                    break;
                case 'dialogue':
                    voice = dialogueVoice || defaultVoice;
                    break;
                case 'dialogue_only':
                case 'entire_message':
                    voice = defaultVoice;
                    break;
            }
            if (voice && voice !== DO_NOT_PLAY_VALUE) {
                return {
                    dialogue: part.dialogue,
                    voice: voice,
                    version: version,
                    emotion: taskEmotion,
                    character: part.character,
                    bypassCache: true
                };
            }
            return null;
        }).filter(Boolean);
        if (tasksToGenerate.length === 0) {
            showNotification("没有需要播放的对话内容（请检查语音配置）。", 'warning');
            return;
        }
        isPlaying = true;
        isPaused = false;
        generationQueue = [...tasksToGenerate];
        playbackQueue = [];
        currentPlaybackIndex = 0; // 重置播放索引
        document.getElementById('tts-stop-btn').style.display = 'inline-block';
        document.getElementById('tts-replay-btn').disabled = true;
        document.getElementById('tts-reinfer-btn').disabled = true;
        processGenerationQueue();
    }

    // 更新播放按钮
    function updatePlayButton(icon, text) {
        const playButton = document.getElementById('tts-play-btn');
        if (playButton) {
            playButton.innerHTML = `<i class="icon">${icon}</i><span class="text">${text}</span>`;
        }
    }

    // 处理生成队列
    async function processGenerationQueue() {
        if (!isPlaying) return;

        if (generationQueue.length > 0) {
            updatePlayButton('⏳', '生成中...');
            document.getElementById('tts-play-btn').disabled = true;

            try {
                const results = await generateAudioSequentially(generationQueue);
                playbackQueue.push(...results);
                generationQueue = [];
            } catch (error) {
                console.error('音频生成失败:', error);
                showNotification('音频生成失败，请检查TTS服务控制台以了解详情。', 'error');
                handleStopClick();
                return;
            }

            if (playbackQueue.length === 0) {
                showNotification('所有对话都生成失败，请检查TTS服务控制台以了解详情。', 'error');
                handleStopClick();
                return;
            }

            lastPlayedQueue = [...playbackQueue];
            document.getElementById('tts-play-btn').disabled = false;
            document.getElementById('tts-replay-btn').disabled = false;
            document.getElementById('tts-reinfer-btn').disabled = false;
            updatePlayButton('⏸', '暂停');

            processPlaybackQueue();
        }
    }

    // 处理播放队列
    async function processPlaybackQueue() {
        // 防止重复处理队列
        if (isProcessingQueue) {
            console.log('播放队列正在处理中，跳过重复调用');
            return;
        }

        if (isPaused) return;
        if (playbackQueue.length === 0 || !isPlaying) {
            if (isPlaying) handleStopClick();
            return;
        }

        // 检查是否应该播放当前索引的任务
        if (currentPlaybackIndex >= playbackQueue.length) {
            console.log('播放序列已完成');
            if (isPlaying) handleStopClick();
            return;
        }

        // 锁定队列处理
        isProcessingQueue = true;
        const currentSequenceId = ++playbackSequenceId;

        try {
            // 获取当前应该播放的任务（不移除，保持队列完整）
            const task = playbackQueue[currentPlaybackIndex];

            if (!task) {
                console.log('当前播放索引超出队列范围');
                return;
            }

            console.log(`开始播放第 ${currentPlaybackIndex + 1} 个任务，序列ID: ${currentSequenceId}`);

            let blobUrl;

            if (task.preloadedBlobUrl) {
                blobUrl = task.preloadedBlobUrl;
                task.preloadedBlobUrl = null;
            } else {
                blobUrl = await fetchAudioBlob(task.url);
            }

            preloadNextAudio();

            // 播放音频
            await playAudio(blobUrl);

            // 检查序列ID是否仍然有效（防止被其他调用覆盖）
            if (currentSequenceId === playbackSequenceId && !isPaused) {
                currentPlaybackIndex++;
                console.log(`第 ${currentPlaybackIndex} 个任务播放完成，准备播放下一个`);

                // 继续处理下一个任务
                setTimeout(() => {
                    isProcessingQueue = false;
                    processPlaybackQueue();
                }, 100); // 短暂延迟确保音频播放完成
            } else {
                console.log('播放序列已更改，停止当前播放');
                isProcessingQueue = false;
            }
        } catch (error) {
            console.error('播放任务失败:', error);
            if (isPlaying) {
                showNotification(`播放失败: ${error.message}`, 'error');
                handleStopClick();
            }
            isProcessingQueue = false;
        }
    }

    // 创建通知容器
    function createNotificationContainer() {
        const container = document.createElement('div');
        container.id = 'tts-notification-container';
        document.body.appendChild(container);
        return container;
    }

    // 显示通知
    function showNotification(message, type = 'info', duration = 3000) {
        const container = document.getElementById('tts-notification-container') || createNotificationContainer();
        const notification = document.createElement('div');
        notification.className = `tts-notification ${type}`;
        notification.textContent = message;

        container.appendChild(notification);

        setTimeout(() => {
            notification.classList.add('show');
        }, 100);

        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }, duration);
    }

    // 显示控制台日志查看器
    function showConsoleLogger() {
        const existingModal = document.getElementById('console-logger-modal');
        if (existingModal) {
            existingModal.remove();
            return;
        }

        const modal = document.createElement('div');
        modal.id = 'console-logger-modal';
        modal.className = 'tts-modal';

        const modalContent = document.createElement('div');
        modalContent.className = 'tts-modal-content';
        modalContent.style.maxWidth = '900px';
        modalContent.style.maxHeight = '700px';

        // 头部
        const header = document.createElement('div');
        header.className = 'tts-modal-header';
        header.innerHTML = `
            <h2><i class="icon">📋</i> 控制台日志查看器</h2>
            <div class="header-buttons">
                <button id="clear-logs-btn" class="tts-header-btn" title="清空日志">
                    <i class="icon">🗑️</i>
                </button>
                <button id="refresh-logs-btn" class="tts-header-btn" title="刷新日志">
                    <i class="icon">🔄</i>
                </button>
                <button class="tts-close-btn">×</button>
            </div>
        `;

        // 内容区域
        const body = document.createElement('div');
        body.className = 'tts-modal-body';
        body.style.padding = '0';

        // 日志显示区域
        const logContainer = document.createElement('div');
        logContainer.id = 'log-container';
        logContainer.style.cssText = `
            height: 500px;
            overflow-y: auto;
            background: #1e1e1e;
            color: #d4d4d4;
            font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
            font-size: 12px;
            line-height: 1.4;
            padding: 15px;
            border-radius: 8px;
            margin: 20px;
        `;

        // 过滤选项
        const filterContainer = document.createElement('div');
        filterContainer.style.cssText = `
            padding: 15px 20px;
            border-bottom: 1px solid #e0e0e0;
            background: #f8f9fa;
        `;
        filterContainer.innerHTML = `
            <div style="display: flex; gap: 15px; align-items: center; flex-wrap: wrap;">
                <label style="font-weight: 600;">日志类型过滤：</label>
                <label style="display: flex; align-items: center; gap: 5px;">
                    <input type="checkbox" id="filter-log" checked> <span>Log</span>
                </label>
                <label style="display: flex; align-items: center; gap: 5px;">
                    <input type="checkbox" id="filter-warn" checked> <span>Warn</span>
                </label>
                <label style="display: flex; align-items: center; gap: 5px;">
                    <input type="checkbox" id="filter-error" checked> <span>Error</span>
                </label>
                <label style="display: flex; align-items: center; gap: 5px;">
                    <input type="checkbox" id="filter-info" checked> <span>Info</span>
                </label>
                <div style="margin-left: auto;">
                    <span id="log-count" style="color: #666; font-size: 12px;">共 0 条日志</span>
                </div>
            </div>
        `;

        body.appendChild(filterContainer);
        body.appendChild(logContainer);

        modalContent.appendChild(header);
        modalContent.appendChild(body);
        modal.appendChild(modalContent);
        document.body.appendChild(modal);

        // 渲染日志
        function renderLogs() {
            const filters = {
                log: document.getElementById('filter-log').checked,
                warn: document.getElementById('filter-warn').checked,
                error: document.getElementById('filter-error').checked,
                info: document.getElementById('filter-info').checked
            };

            const filteredLogs = consoleLogs.filter(log => filters[log.type]);
            const logCount = document.getElementById('log-count');
            logCount.textContent = `共 ${filteredLogs.length} 条日志`;

            logContainer.innerHTML = filteredLogs.map(log => {
                const typeColors = {
                    log: '#d4d4d4',
                    warn: '#ffcc02',
                    error: '#f44747',
                    info: '#007acc'
                };
                const typeIcons = {
                    log: '📝',
                    warn: '⚠️',
                    error: '❌',
                    info: 'ℹ️'
                };

                return `
                    <div style="margin-bottom: 8px; padding: 8px; border-left: 3px solid ${typeColors[log.type]}; background: rgba(255,255,255,0.02);">
                        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
                            <span style="color: ${typeColors[log.type]};">${typeIcons[log.type]} [${log.type.toUpperCase()}]</span>
                            <span style="color: #888; font-size: 11px;">${log.timestamp}</span>
                        </div>
                        <div style="color: ${typeColors[log.type]}; word-break: break-all;">${log.message}</div>
                    </div>
                `;
            }).join('');

            // 滚动到底部
            logContainer.scrollTop = logContainer.scrollHeight;
        }

        // 初始渲染
        renderLogs();

        // 事件监听器
        header.querySelector('.tts-close-btn').addEventListener('click', () => {
            modal.remove();
        });

        header.querySelector('#clear-logs-btn').addEventListener('click', () => {
            consoleLogs = [];
            renderLogs();
        });

        header.querySelector('#refresh-logs-btn').addEventListener('click', () => {
            renderLogs();
        });

        // 过滤选项变化时重新渲染
        ['filter-log', 'filter-warn', 'filter-error', 'filter-info'].forEach(id => {
            document.getElementById(id).addEventListener('change', renderLogs);
        });

        // 点击模态框外部关闭
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.remove();
            }
        });
    }

    // 添加美化样式
    GM_addStyle(`
        /* 浮动面板基础样式 */
        .tts-panel {
            position: fixed;
            top: 50%;
            right: 20px;
            transform: translateY(-50%);
            z-index: 9999;
            background: rgba(255, 255, 255, 0.9);
            backdrop-filter: blur(10px);
            border: 1px solid rgba(255, 255, 255, 0.3);
            border-radius: 16px;
            padding: 12px;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            user-select: none;
            /* 移动端优化 */
            max-width: calc(100vw - 40px);
            max-height: calc(100vh - 40px);
        }

        .tts-panel:hover {
            background: rgba(255, 255, 255, 0.95);
            box-shadow: 0 12px 40px rgba(0, 0, 0, 0.15);
            transform: translateY(-50%) scale(1.02);
            transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        }

        /* 拖拽中效果 */
        .tts-panel.dragging {
            transform: translateY(-50%) scale(1.05);
            box-shadow: 0 16px 48px rgba(0, 0, 0, 0.2);
        }


        /* 边缘依附模式 */
        .tts-panel.edge-mode {
            right: -60px;
            background: rgba(255, 255, 255, 0.7);
            transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .tts-panel.edge-mode:hover,
        .tts-panel.edge-mode.expanded {
            right: 20px;
            background: rgba(255, 255, 255, 0.95);
        }

        .tts-panel.edge-mode .tts-control-btn .text {
            opacity: 0;
            width: 0;
            overflow: hidden;
            transition: all 0.3s ease;
        }

        .tts-panel.edge-mode.expanded .tts-control-btn .text {
            opacity: 1;
            width: auto;
            margin-left: 6px;
        }

        /* 边缘隐藏模式 */
        .tts-panel.edge-hidden {
            right: -200px !important;
            background: rgba(255, 255, 255, 0.3);
            transition: all 0.5s cubic-bezier(0.4, 0, 0.2, 1);
            opacity: 0.3;
            pointer-events: none;
        }

        .tts-panel.edge-hidden:hover {
            right: 0px !important;
            background: rgba(255, 255, 255, 0.95);
            opacity: 1;
            pointer-events: auto;
            transform: translateY(-50%) scale(1.05);
        }

        .tts-panel.edge-hidden .tts-control-btn .text {
            opacity: 0;
            width: 0;
            overflow: hidden;
            transition: all 0.3s ease;
        }

        .tts-panel.edge-hidden:hover .tts-control-btn .text {
            opacity: 1;
            width: auto;
            margin-left: 6px;
        }

        /* 边缘角标指示器 */
        .tts-edge-indicator {
            position: fixed;
            right: 0px;
            top: 50%;
            transform: translateY(-50%);
            width: 24px;
            height: 60px;
            background: transparent;
            backdrop-filter: none;
            -webkit-backdrop-filter: none;
            border: none;
            color: rgba(255, 255, 255, 0.3);
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 10px 0 0 10px;
            cursor: pointer;
            z-index: 10000;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            box-shadow: none;
            user-select: none;
        }

        .tts-edge-indicator:hover {
            background: linear-gradient(135deg, rgba(128, 90, 213, 0.5), rgba(106, 90, 205, 0.6));
            backdrop-filter: blur(8px);
            -webkit-backdrop-filter: blur(8px);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-right: none;
            width: 28px;
            box-shadow: -4px 0 16px rgba(0, 0, 0, 0.3);
            color: white;
            animation: edgeIndicatorGlow 2.5s ease-in-out infinite;
        }

        .tts-edge-indicator:active {
            transform: translateY(-50%) scale(0.95);
        }

        /* 角标动画效果 */
        @keyframes edgeIndicatorGlow {
            0%, 100% {
                box-shadow: -2px 0 12px rgba(128, 90, 213, 0.2), -4px 0 16px rgba(0, 0, 0, 0.3);
            }
            50% {
                box-shadow: -2px 0 20px rgba(128, 90, 213, 0.5), -4px 0 16px rgba(0, 0, 0, 0.3);
            }
        }

        /* 主控制区域 */
        .tts-main-controls {
            display: flex;
            flex-direction: column;
            gap: 8px;
            align-items: center;
        }


        /* 控制按钮样式 */
        .tts-control-btn {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
            padding: 10px 14px;
            border: none;
            border-radius: 12px;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
            min-width: 48px;
            position: relative;
            overflow: hidden;
        }

        .tts-control-btn::before {
            content: '';
            position: absolute;
            top: 0;
            left: -100%;
            width: 100%;
            height: 100%;
            background: linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent);
            transition: left 0.5s;
        }

        .tts-control-btn:hover::before {
            left: 100%;
        }

        .tts-control-btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        }

        .tts-control-btn:active {
            transform: translateY(0);
        }

        .tts-control-btn:disabled {
            opacity: 0.5;
            cursor: not-allowed;
            transform: none;
        }

        .tts-control-btn .icon {
            font-size: 16px;
            line-height: 1;
        }

        .tts-control-btn .text {
            font-size: 12px;
            white-space: nowrap;
        }

        /* 按钮颜色主题 */
        .tts-control-btn.primary {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
        }

        .tts-control-btn.primary:hover {
            background: linear-gradient(135deg, #5a6fd8 0%, #6a4190 100%);
        }

        .tts-control-btn.secondary {
            background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
            color: white;
        }

        .tts-control-btn.secondary:hover {
            background: linear-gradient(135deg, #ee82f0 0%, #f34960 100%);
        }

        .tts-control-btn.danger {
            background: linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%);
            color: #d63384;
        }

        .tts-control-btn.danger:hover {
            background: linear-gradient(135deg, #ff8a8e 0%, #fdbfdf 100%);
        }

        .tts-control-btn.settings {
            background: linear-gradient(135deg, #a8edea 0%, #fed6e3 100%);
            color: #495057;
        }

        .tts-control-btn.settings:hover {
            background: linear-gradient(135deg, #98e3e0 0%, #fdc6d3 100%);
        }

        /* 状态指示器 */
        .tts-status-indicator {
            display: flex;
            align-items: center;
            gap: 6px;
            padding: 6px 10px;
            background: rgba(255, 255, 255, 0.8);
            border: 1px solid rgba(0, 0, 0, 0.1);
            border-radius: 20px;
            font-size: 11px;
            font-weight: 600;
            color: #6c757d;
        }

        .status-dot {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background: #dee2e6;
            transition: all 0.3s ease;
        }

        .status-dot.active {
            background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);
            box-shadow: 0 0 8px rgba(79, 172, 254, 0.4);
        }

        /* 设置模态框 */
        .tts-modal {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.5);
            backdrop-filter: blur(4px);
            z-index: 10000;
            display: flex;
            align-items: center;
            justify-content: center;
            animation: fadeIn 0.3s ease;
        }

        @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
        }

        .tts-modal-content {
            background: white;
            border-radius: 16px;
            width: 95%;
            max-width: 900px;
            max-height: 90vh;
            overflow: hidden;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2);
            animation: slideUp 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            /* 移动端优化 */
            position: relative;
            margin: 20px;
        }

        @keyframes slideUp {
            from {
                opacity: 0;
                transform: translateY(30px);
            }
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }

        .tts-modal-header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 15px 20px;
            display: flex;
            align-items: center;
            justify-content: space-between;
        }

        .tts-modal-header h2 {
            margin: 0;
            font-size: 18px;
            font-weight: 600;
            display: flex;
            align-items: center;
            gap: 10px;
            white-space: nowrap;
        }

        .tts-modal-header .version {
            background: rgba(255, 255, 255, 0.2);
            padding: 2px 8px;
            border-radius: 12px;
            font-size: 11px;
            font-weight: 500;
        }

        .header-buttons {
            display: flex;
            align-items: center;
            gap: 6px;
            flex-shrink: 0;
        }

        .tts-header-btn {
            background: rgba(255, 255, 255, 0.2);
            border: none;
            color: white;
            width: 32px;
            height: 32px;
            border-radius: 50%;
            cursor: pointer;
            font-size: 14px;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.2s ease;
        }

        .tts-header-btn:hover {
            background: rgba(255, 255, 255, 0.3);
            transform: scale(1.1);
        }

        .tts-close-btn {
            background: rgba(255, 255, 255, 0.2);
            border: none;
            color: white;
            width: 32px;
            height: 32px;
            border-radius: 50%;
            cursor: pointer;
            font-size: 18px;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.2s ease;
        }

        .tts-close-btn:hover {
            background: rgba(255, 255, 255, 0.3);
            transform: scale(1.1);
        }

        .tts-modal-body {
            padding: 30px 35px;
            max-height: calc(90vh - 80px);
            overflow-y: auto;
        }

        .tts-setting-section {
            margin-bottom: 25px;
            background: #f8f9fa;
            border-radius: 12px;
            padding: 20px;
            border: 1px solid #e9ecef;
        }

        .tts-setting-section h3 {
            margin: 0 0 15px 0;
            font-size: 16px;
            font-weight: 600;
            color: #495057;
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .tts-setting-item {
            margin-bottom: 15px;
        }

        .tts-setting-item label {
            display: block;
            margin-bottom: 5px;
            font-weight: 500;
            color: #495057;
            font-size: 14px;
        }

        .version-badge {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 2px 8px;
            border-radius: 12px;
            font-size: 11px;
            font-weight: 500;
            flex-shrink: 0;
        }

        .tts-setting-item input[type="text"],
        .tts-setting-item select {
            width: 100%;
            padding: 8px 12px;
            border: 1px solid #ced4da;
            border-radius: 8px;
            font-size: 14px;
            background: white;
            transition: all 0.2s ease;
        }

        .tts-setting-item input[type="text"]:focus,
        .tts-setting-item select:focus {
            outline: none;
            border-color: #667eea;
            box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
        }

        .tts-radio-group {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 10px;
            margin-top: 10px;
        }

        .tts-radio-item {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 8px 12px;
            background: white;
            border: 1px solid #dee2e6;
            border-radius: 8px;
            cursor: pointer;
            transition: all 0.2s ease;
        }

        .tts-radio-item:hover {
            border-color: #667eea;
            background: #f8f9ff;
        }

        .tts-radio-item input[type="radio"] {
            margin: 0;
        }

        .tts-radio-item input[type="radio"]:checked + span {
            color: #667eea;
            font-weight: 600;
        }

        .tts-toggle-group {
            display: flex;
            gap: 10px;
            margin-top: 10px;
        }

        .tts-toggle-item {
            flex: 1;
            padding: 10px 15px;
            background: white;
            border: 2px solid #dee2e6;
            border-radius: 8px;
            cursor: pointer;
            text-align: center;
            transition: all 0.2s ease;
            position: relative;
            overflow: hidden;
        }

        .tts-toggle-item::before {
            content: '';
            position: absolute;
            top: 0;
            left: -100%;
            width: 100%;
            height: 100%;
            background: linear-gradient(90deg, transparent, rgba(102, 126, 234, 0.1), transparent);
            transition: left 0.5s;
        }

        .tts-toggle-item:hover::before {
            left: 100%;
        }

        .tts-toggle-item.active {
            border-color: #667eea;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
        }

        .tts-toggle-item input[type="radio"] {
            display: none;
        }

        .tts-switch-label {
            display: flex;
            align-items: center;
            justify-content: space-between;
            cursor: pointer;
            margin-bottom: 5px;
        }

        .tts-switch-slider {
            position: relative;
            width: 50px;
            height: 24px;
            background: #ccc;
            border-radius: 24px;
            transition: all 0.3s ease;
        }

        .tts-switch-slider::before {
            content: '';
            position: absolute;
            width: 20px;
            height: 20px;
            border-radius: 50%;
            background: white;
            top: 2px;
            left: 2px;
            transition: all 0.3s ease;
            box-shadow: 0 2px 4px rgba(0,0,0,0.2);
        }

        .tts-switch-label input[type="checkbox"] {
            display: none;
        }

        .tts-switch-label input[type="checkbox"]:checked + .tts-switch-slider {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        }

        .tts-switch-label input[type="checkbox"]:checked + .tts-switch-slider::before {
            transform: translateX(26px);
        }

        .tts-setting-desc {
            font-size: 12px;
            color: #6c757d;
            margin: 5px 0 0 0;
            font-style: italic;
        }

        .tts-setting-item input[type="range"] {
            width: 100%;
            margin-top: 8px;
            -webkit-appearance: none;
            height: 6px;
            border-radius: 3px;
            background: #ddd;
            outline: none;
        }

        .tts-setting-item input[type="range"]::-webkit-slider-thumb {
            -webkit-appearance: none;
            appearance: none;
            width: 18px;
            height: 18px;
            border-radius: 50%;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            cursor: pointer;
            box-shadow: 0 2px 4px rgba(0,0,0,0.2);
        }

        .tts-character-item {
            background: white;
            border: 1px solid #dee2e6;
            border-radius: 8px;
            padding: 12px;
            margin-bottom: 10px;
        }

        .tts-character-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 8px;
        }

        .character-name {
            font-weight: 600;
            color: #495057;
        }

        .tts-delete-char {
            background: #ff6b6b;
            color: white;
            border: none;
            width: 24px;
            height: 24px;
            border-radius: 50%;
            cursor: pointer;
            font-size: 14px;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.2s ease;
        }

        .tts-delete-char:hover {
            background: #ff5252;
            transform: scale(1.1);
        }

        .tts-character-voice {
            width: 100%;
            padding: 6px 10px;
            border: 1px solid #ced4da;
            border-radius: 6px;
            font-size: 13px;
        }

        .tts-character-speed-control {
            margin-top: 8px;
            padding: 8px;
            background: #f8f9fa;
            border-radius: 6px;
            border: 1px solid #e9ecef;
        }

        .tts-character-speed-control label {
            display: block;
            font-size: 12px;
            color: #6c757d;
            margin-bottom: 4px;
            font-weight: 500;
        }

        .tts-character-speed-slider,
        .tts-character-speed-slider-in-group {
            width: 100%;
            height: 4px;
            border-radius: 2px;
            background: #dee2e6;
            outline: none;
            -webkit-appearance: none;
            appearance: none;
        }

        .tts-character-speed-slider::-webkit-slider-thumb,
        .tts-character-speed-slider-in-group::-webkit-slider-thumb {
            -webkit-appearance: none;
            appearance: none;
            width: 16px;
            height: 16px;
            border-radius: 50%;
            background: #667eea;
            cursor: pointer;
            box-shadow: 0 2px 4px rgba(0,0,0,0.2);
            transition: all 0.2s ease;
        }

        .tts-character-speed-slider::-webkit-slider-thumb:hover,
        .tts-character-speed-slider-in-group::-webkit-slider-thumb:hover {
            background: #5a6fd8;
            transform: scale(1.1);
        }

        .tts-character-speed-slider::-moz-range-thumb,
        .tts-character-speed-slider-in-group::-moz-range-thumb {
            width: 16px;
            height: 16px;
            border-radius: 50%;
            background: #667eea;
            cursor: pointer;
            border: none;
            box-shadow: 0 2px 4px rgba(0,0,0,0.2);
        }

        .tts-character-speed-value,
        .tts-character-speed-value-in-group {
            font-weight: 600;
            color: #495057;
        }

        .tts-empty-state {
            text-align: center;
            color: #6c757d;
            font-style: italic;
            padding: 20px;
        }

        /* 通知样式 */
        .tts-notification {
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 10001;
            padding: 12px 20px;
            border-radius: 8px;
            color: white;
            font-size: 14px;
            font-weight: 500;
            max-width: 300px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
            transform: translateX(100%);
            transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .tts-notification.show {
            transform: translateX(0);
        }

        .tts-notification.info {
            background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);
        }

        .tts-notification.success {
            background: linear-gradient(135deg, #43e97b 0%, #38f9d7 100%);
        }

        .tts-notification.warning {
            background: linear-gradient(135deg, #fa709a 0%, #fee140 100%);
            color: #333;
        }

        .tts-notification.error {
            background: linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%);
            color: #721c24;
        }

        /* 响应式设计 */
        @media (max-width: 768px) {
            .tts-panel {
                top: 50%;
                transform: translateY(-50%);
                right: 10px;
                padding: 8px;
                /* 确保在手机上完整显示 */
                max-width: calc(100vw - 20px);
                max-height: calc(100vh - 40px);
                overflow-y: auto;
            }

            .tts-control-btn {
                padding: 8px 10px;
                min-width: 40px;
                font-size: 12px;
            }

            .tts-control-btn .text {
                display: none;
            }

            .tts-modal-content {
                width: 98%;
                margin: 5px;
                max-height: calc(100vh - 10px);
                /* 确保弹窗在手机上完全显示 */
                position: fixed;
                top: 5px;
                left: 50%;
                transform: translateX(-50%);
            }

            .tts-modal-header {
                padding: 12px 15px;
                flex-wrap: nowrap;
            }

            .tts-modal-header h2 {
                font-size: 16px;
                flex-shrink: 1;
                min-width: 0;
                white-space: nowrap;
            }

            .tts-modal-header .version {
                font-size: 10px;
                padding: 1px 6px;
                flex-shrink: 0;
            }

            .header-buttons {
                gap: 4px;
                flex-shrink: 0;
            }

            .tts-header-btn {
                width: 28px;
                height: 28px;
                font-size: 12px;
            }

            .tts-close-btn {
                width: 28px;
                height: 28px;
                font-size: 16px;
            }

            .tts-modal-body {
                padding: 20px 25px;
                max-height: calc(100vh - 120px);
                overflow-y: auto;
            }

            .tts-radio-group {
                grid-template-columns: 1fr;
            }

            .tts-toggle-group {
                flex-direction: column;
            }


            .tts-edge-indicator {
                top: 50%;
                transform: translateY(-50%);
            }
        }

        /* 超小屏幕优化 */
        @media (max-width: 480px) {
            .tts-panel {
                right: 5px;
                padding: 6px;
                top: 50%;
                transform: translateY(-50%);
                bottom: auto;
            }

            .tts-control-btn {
                padding: 6px 8px;
                min-width: 36px;
                font-size: 11px;
            }

            .tts-modal-content {
                width: 98%;
                margin: 5px;
                max-height: calc(100vh - 10px);
            }

            .tts-modal-body {
                padding: 10px;
                max-height: calc(100vh - 100px);
            }
        }

        /* 滚动条美化 */
        .tts-modal-body::-webkit-scrollbar {
            width: 6px;
        }

        .tts-modal-body::-webkit-scrollbar-track {
            background: #f1f1f1;
            border-radius: 3px;
        }

        .tts-modal-body::-webkit-scrollbar-thumb {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            border-radius: 3px;
        }

        .tts-modal-body::-webkit-scrollbar-thumb:hover {
            background: linear-gradient(135deg, #5a6fd8 0%, #6a4190 100%);
        }

        /* 角色分组管理样式 */
        .tts-group-controls {
            display: flex;
            gap: 10px;
            align-items: center;
            margin-bottom: 15px;
        }

        .tts-group-controls input[type="text"] {
            flex: 1;
            padding: 8px 12px;
            border: 1px solid #ced4da;
            border-radius: 8px;
            font-size: 14px;
        }

        .tts-group-controls input[type="color"] {
            width: 40px;
            height: 36px;
            border: 1px solid #ced4da;
            border-radius: 8px;
            cursor: pointer;
            background: none;
        }

        .tts-add-group-btn {
            padding: 8px 16px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border: none;
            border-radius: 8px;
            cursor: pointer;
            font-size: 14px;
            font-weight: 500;
            transition: all 0.2s ease;
        }

        .tts-add-group-btn:hover {
            background: linear-gradient(135deg, #5a6fd8 0%, #6a4190 100%);
            transform: translateY(-1px);
        }

        .tts-test-btn {
            padding: 8px 16px;
            background: linear-gradient(135deg, #28a745 0%, #20c997 100%);
            color: white;
            border: none;
            border-radius: 8px;
            cursor: pointer;
            font-size: 14px;
            font-weight: 500;
            transition: all 0.2s ease;
            white-space: nowrap;
        }

        .tts-test-btn:hover {
            background: linear-gradient(135deg, #218838 0%, #1db584 100%);
            transform: translateY(-1px);
        }

        .tts-test-btn:disabled {
            background: #6c757d;
            cursor: not-allowed;
            transform: none;
        }

        .tts-group-item {
            background: white;
            border: 1px solid #dee2e6;
            border-radius: 12px;
            margin-bottom: 15px;
            overflow: hidden;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
            transition: all 0.2s ease;
        }

        .tts-group-item:hover {
            box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
            transform: translateY(-1px);
        }

        .tts-group-header {
            padding: 15px 20px;
            background: #f8f9fa;
            display: flex;
            align-items: center;
            justify-content: space-between;
            border-bottom: 1px solid #e9ecef;
        }

        .tts-group-info {
            display: flex;
            flex-direction: column;
            gap: 4px;
        }

        .tts-group-name {
            font-size: 16px;
            font-weight: 600;
            color: #495057;
            display: flex;
            align-items: center;
            gap: 8px;
            cursor: pointer;
        }

        .tts-collapse-icon {
            font-size: 12px;
            color: #6c757d;
            transition: transform 0.2s ease;
        }

        .tts-character-info {
            display: flex;
            align-items: center;
            gap: 10px;
            flex: 1;
        }

        .tts-character-voice-in-group {
            min-width: 150px;
            padding: 4px 8px;
            border: 1px solid #ced4da;
            border-radius: 4px;
            font-size: 12px;
            background: white;
        }

        .tts-group-count {
            font-size: 12px;
            color: #6c757d;
        }

        .tts-delete-group {
            background: #ff6b6b;
            color: white;
            border: none;
            padding: 6px 12px;
            border-radius: 6px;
            cursor: pointer;
            font-size: 12px;
            transition: all 0.2s ease;
        }

        .tts-delete-group:hover {
            background: #ff5252;
            transform: scale(1.05);
        }

        .tts-group-content {
            padding: 15px 20px;
        }

        .tts-group-characters {
            margin-bottom: 15px;
        }

        .tts-group-character {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 8px 12px;
            background: #f8f9fa;
            border: 1px solid #e9ecef;
            border-radius: 8px;
            margin-bottom: 8px;
            transition: all 0.2s ease;
        }

        .tts-group-character:hover {
            background: #e9ecef;
            border-color: #ced4da;
        }

        .tts-group-character .character-name {
            font-weight: 500;
            color: #495057;
        }

        .tts-remove-from-group {
            background: #ffc107;
            color: #212529;
            border: none;
            padding: 4px 8px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 11px;
            font-weight: 500;
            transition: all 0.2s ease;
        }

        .tts-remove-from-group:hover {
            background: #ffb300;
            transform: scale(1.05);
        }

        .tts-add-character {
            display: flex;
            gap: 10px;
            align-items: center;
            padding: 12px;
            background: #f8f9fa;
            border: 2px dashed #dee2e6;
            border-radius: 8px;
            transition: all 0.2s ease;
        }

        .tts-add-character:hover {
            border-color: #667eea;
            background: #f8f9ff;
        }

        .tts-character-select {
            flex: 1;
            padding: 6px 10px;
            border: 1px solid #ced4da;
            border-radius: 6px;
            font-size: 13px;
            background: white;
        }

        .tts-add-to-group {
            padding: 6px 12px;
            background: linear-gradient(135deg, #28a745 0%, #20c997 100%);
            color: white;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-size: 12px;
            font-weight: 500;
            transition: all 0.2s ease;
        }

        .tts-add-to-group:hover {
            background: linear-gradient(135deg, #218838 0%, #1ea085 100%);
            transform: translateY(-1px);
        }

        /* 更新设置面板可见性控制 */
        #character-groups-section {
            display: block !important;
        }

        .tts-modal-content {
            width: 90vw;
            max-width: none;
        }
    `);

    // 网址白名单管理
    const URL_WHITELIST_KEY = 'tts_url_whitelist';

    // 获取网址白名单
    function getUrlWhitelist() {
        const whitelist = GM_getValue(URL_WHITELIST_KEY, []);
        return Array.isArray(whitelist) ? whitelist : [];
    }

    // 保存网址白名单
    function saveUrlWhitelist(whitelist) {
        GM_setValue(URL_WHITELIST_KEY, whitelist);
    }

    // 添加网址到白名单
    function addUrlToWhitelist(url) {
        const whitelist = getUrlWhitelist();
        if (!whitelist.includes(url)) {
            whitelist.push(url);
            saveUrlWhitelist(whitelist);
            return true;
        }
        return false;
    }

    // 从白名单移除网址
    function removeUrlFromWhitelist(url) {
        const whitelist = getUrlWhitelist();
        const index = whitelist.indexOf(url);
        if (index > -1) {
            whitelist.splice(index, 1);
            saveUrlWhitelist(whitelist);
            return true;
        }
        return false;
    }

    // 检查当前网址是否在白名单中
    function isCurrentUrlWhitelisted() {
        const whitelist = getUrlWhitelist();

        // 如果白名单为空，则所有网站都显示插件
        if (whitelist.length === 0) {
            return true;
        }

        const currentUrl = window.location.href;
        const currentHost = window.location.host;

        // 检查完整URL或主机名是否在白名单中
        return whitelist.some(url => {
            try {
                const urlObj = new URL(url);
                return urlObj.host === currentHost || url === currentUrl;
            } catch {
                // 如果URL解析失败，进行简单的字符串匹配
                return url === currentHost || url === currentUrl;
            }
        });
    }

    // 获取当前网址的简化表示
    function getCurrentUrlDisplay() {
        return `${window.location.protocol}//${window.location.host}`;
    }


    // 显示网址白名单管理界面
    function showUrlWhitelistManager() {
        const whitelist = getUrlWhitelist();

        // 创建模态框
        const modal = document.createElement('div');
        modal.id = 'tts-whitelist-manager-modal';
        modal.className = 'tts-modal';
        modal.style.zIndex = '999999';

        modal.innerHTML = `
            <div class="tts-modal-content" style="max-width: 700px;">
                <div class="tts-modal-header">
                    <h2><i class="icon">⚙️</i> 网址白名单管理</h2>
                    <button class="tts-close-btn">×</button>
                </div>
                <div class="tts-modal-body">
                    <div style="margin-bottom: 20px;">
                        <h3 style="margin: 0 0 15px 0; color: #333;">添加新网址</h3>
                        <div style="display: flex; gap: 10px; margin-bottom: 15px;">
                            <input type="text" id="new-url-input" placeholder="输入网址，如：https://example.com"
                                   style="flex: 1; padding: 10px; border: 1px solid #ddd; border-radius: 6px; font-size: 14px;">
                            <button id="add-url-btn" style="padding: 10px 20px; background: #28a745; color: white; border: none; border-radius: 6px; cursor: pointer;">
                                <i class="icon">➕</i> 添加
                            </button>
                        </div>
                        <div style="display: flex; gap: 10px;">
                            <button id="add-current-url-manager-btn" style="padding: 10px 20px; background: #007bff; color: white; border: none; border-radius: 6px; cursor: pointer;">
                                <i class="icon">🌐</i> 添加当前网站
                            </button>
                            <button id="clear-all-urls-btn" style="padding: 10px 20px; background: #dc3545; color: white; border: none; border-radius: 6px; cursor: pointer;">
                                <i class="icon">🗑️</i> 清空所有
                            </button>
                        </div>
                    </div>

                    <div>
                        <h3 style="margin: 0 0 15px 0; color: #333;">已添加的网址 (${whitelist.length})</h3>
                        <div id="whitelist-container" style="max-height: 300px; overflow-y: auto; border: 1px solid #ddd; border-radius: 6px;">
                            ${whitelist.length === 0 ?
                                '<div style="padding: 40px; text-align: center; color: #666;"><i class="icon" style="font-size: 48px; display: block; margin-bottom: 10px;">📝</i>暂无添加的网址</div>' :
                                whitelist.map(url => `
                                    <div class="whitelist-item" style="display: flex; justify-content: space-between; align-items: center; padding: 12px 15px; border-bottom: 1px solid #eee;">
                                        <div style="flex: 1;">
                                            <code style="background: #f8f9fa; padding: 4px 8px; border-radius: 4px; font-size: 14px;">${url}</code>
                                            <div style="font-size: 12px; color: #666; margin-top: 4px;">
                                                ${url === getCurrentUrlDisplay() ? '<span style="color: #28a745;">● 当前网站</span>' : ''}
                                            </div>
                                        </div>
                                        <button class="remove-url-btn" data-url="${url}" style="padding: 6px 12px; background: #dc3545; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">
                                            <i class="icon">🗑️</i> 删除
                                        </button>
                                    </div>
                                `).join('')
                            }
                        </div>
                    </div>

                    <div style="margin-top: 20px; padding: 15px; background: #e7f3ff; border: 1px solid #b3d9ff; border-radius: 6px;">
                        <strong>💡 使用说明：</strong>
                        <ul style="margin: 10px 0 0 20px; color: #666;">
                            <li><strong>白名单为空</strong>：TTS播放器在所有网站都会显示（默认行为）</li>
                            <li><strong>白名单有内容</strong>：TTS播放器只在白名单中的网站显示</li>
                            <li>支持完整URL（如：https://example.com）或域名（如：example.com）</li>
                            <li>清空所有网址可恢复默认行为（所有网站都显示）</li>
                        </ul>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // 绑定事件
        document.getElementById('add-url-btn').addEventListener('click', () => {
            const input = document.getElementById('new-url-input');
            const url = input.value.trim();
            if (url) {
                if (addUrlToWhitelist(url)) {
                    input.value = '';
                    modal.remove();
                    showUrlWhitelistManager(); // 刷新界面
                } else {
                    alert('该网址已存在于白名单中！');
                }
            } else {
                alert('请输入有效的网址！');
            }
        });

        document.getElementById('add-current-url-manager-btn').addEventListener('click', () => {
            const currentUrl = getCurrentUrlDisplay();
            if (addUrlToWhitelist(currentUrl)) {
                modal.remove();
                showUrlWhitelistManager(); // 刷新界面
            } else {
                alert('当前网站已存在于白名单中！');
            }
        });

        document.getElementById('clear-all-urls-btn').addEventListener('click', () => {
            if (confirm('确定要清空所有网址吗？这将导致TTS播放器在所有网站上都不显示。')) {
                saveUrlWhitelist([]);
                modal.remove();
                showUrlWhitelistManager(); // 刷新界面
            }
        });

        // 绑定删除按钮事件
        modal.querySelectorAll('.remove-url-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const url = btn.getAttribute('data-url');
                if (confirm(`确定要删除网址 "${url}" 吗？`)) {
                    removeUrlFromWhitelist(url);
                    modal.remove();
                    showUrlWhitelistManager(); // 刷新界面
                }
            });
        });

        // 绑定关闭事件
        modal.querySelector('.tts-close-btn').addEventListener('click', () => {
            modal.remove();
        });

        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.remove();
            }
        });

        // 回车键添加网址
        document.getElementById('new-url-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                document.getElementById('add-url-btn').click();
            }
        });
    }

    // 初始化
    window.addEventListener('load', async () => {
        // 检查网址白名单
        if (!isCurrentUrlWhitelisted()) {
            return; // 如果不在白名单中，不继续初始化
        }

        Settings.load();
        try {
            await fetchTTSModels();
        } catch (error) {
            console.error("初始化失败：无法从TTS服务器加载模型列表。该错误不会弹窗，将在您点击播放时提示。", error);
        }
        createUI();
        observeChat();
    });

    // 为指定版本获取模型列表（带缓存）
    async function getModelsForVersion(version) {
        if (modelCache.has(version)) {
            return modelCache.get(version);
        }

        try {
            const response = await makeRequest(TTS_API_ENDPOINT_MODELS, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                data: JSON.stringify({
                    version: version
                }),
                timeout: TTS_FETCH_TIMEOUT
            });

            if (response.status === 200) {
                const data = JSON.parse(response.responseText);
                const models = Object.keys(data.models || {});
                modelCache.set(version, models);
                return models;
            } else {
                return [];
            }
        } catch (error) {
            console.error(`获取版本 ${version} 的模型失败:`, error);
            return [];
        }
    }

    // 使边缘角标可拖拽
    function makeIndicatorDraggable(indicator) {
        let isDragging = false;
        let hasDragged = false;
        let startY;
        let startTop;
        let mouseMoveHandler;
        let mouseUpHandler;
        let touchMoveHandler;
        let touchEndHandler;

        const getClientY = (e) => e.touches ? e.touches[0].clientY : e.clientY;

        const dragStart = (e) => {
            e.stopPropagation();
            isDragging = true;
            hasDragged = false;

            startY = getClientY(e);
            startTop = indicator.getBoundingClientRect().top;

            indicator.style.transition = 'none'; // 拖拽时禁用过渡动画
            indicator.style.transform = 'none';
            indicator.style.top = `${startTop}px`;

            document.body.style.cursor = 'ns-resize';
            document.body.style.userSelect = 'none';

            // 动态添加事件监听器
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

            if (!hasDragged && Math.abs(clientY - startY) > 5) {
                hasDragged = true;
            }

            if (!hasDragged) return;

            e.preventDefault();

            const deltaY = clientY - startY;
            let newTop = startTop + deltaY;

            const indicatorHeight = indicator.offsetHeight;
            newTop = Math.max(0, Math.min(newTop, window.innerHeight - indicatorHeight));

            indicator.style.top = `${newTop}px`;
        };

        const dragEnd = (e) => {
            if (!isDragging) return;

            if (hasDragged) {
                edgeIndicatorLastTop = indicator.style.top;
            }

            isDragging = false;

            indicator.style.transition = ''; // 恢复过渡动画
            document.body.style.cursor = '';
            document.body.style.userSelect = '';

            // 移除事件监听器
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
            if (hasDragged) {
                e.preventDefault();
                e.stopPropagation();
            } else {
                showPanel();
            }
        });
    }

    // ==================== 全局暴露TTS播放器功能 ====================

    // 创建全局TTS播放器对象
    window.ttsPlayer = {
        // 基础功能
        generateAudio: generateSingleAudio,
        fetchAudioBlob: fetchAudioBlob,
        playAudio: playAudio,

        // 流式播放功能（旧版本兼容）
        startStreamingPlayback: startStreamingPlayback,
        stopStreamingPlayback: stopStreamingPlayback,
        playStreamingSegment: playStreamingSegment,
        triggerStreamingPlayback: triggerStreamingPlayback,
        getStreamingStatus: getStreamingStatus,

        // GAL流式播放器（新版本）
        galStreaming: GalStreamingPlayer,

        // 状态变量
        get isPlaying() {
            return isPlaying;
        },
        get isPaused() {
            return isPaused;
        },
        get currentAudio() {
            return currentAudio;
        },
        get isStreamingMode() {
            return isStreamingMode;
        },
        get defaultVoice() {
            return defaultVoice;
        },
        get globalSpeed() {
            return speedFacter;
        },
        get volume() {
            return 1.0;
        }, // TTS播放器默认音量

        // 配置变量
        get detectionMode() {
            return detectionMode;
        },
        get characterVoices() {
            return characterVoices;
        },
        get ttsModels() {
            return ttsModels;
        },

        // 工具方法
        showNotification: showNotification,
        updateStatusIndicator: updateStatusIndicator
    };

    console.log('TTS播放器全局对象已创建');

    // 初始化控制台日志捕获
    initConsoleLogger();
    console.log('控制台日志捕获已启用');

})();